// make-supa-mock.js
//
// Mocks the exact chain of @supabase/supabase-js calls that index.html's
// loadData()/saveData()/detectStorageMode() make, so we can simulate
// network failures deterministically without a real network or a headless
// browser. Kept as a standalone module (not copy-pasted per test file) so
// every test that needs it shares one implementation.

function makeSupaMock(kv = new Map(), mode = { read: "ok", write: "ok", connect: "ok", session: { user: { id: "test-user", email: "tester@trace.local" } } }) {
  let authSession = mode.session === undefined ? { user: { id: "test-user", email: "tester@trace.local" } } : mode.session;
  let authCallback = null;
  const client = {
    from(table) {
      return {
        select(_cols) {
          return {
            // detectStorageMode(): supa.from(...).select("key").limit(1)
            limit(_n) {
              if (mode.connect === "network_fail") {
                return Promise.resolve({ data: null, error: { message: "network down" } });
              }
              return Promise.resolve({ data: [], error: null });
            },
            // loadData(): supa.from(...).select("value").eq("key",k).maybeSingle()
            // Production's overwrite guard also chains .abortSignal(controller.signal)
            // onto this same call (see saveDataUnlocked() in index.html), so the mock
            // must accept it too -- a thenable that also exposes maybeSingle()/abortSignal()
            // lets production code chain either method in either order without changing
            // the resolved value.
            eq(_col, key) {
              const resolveMaybeSingle = async () => {
                if (mode.read === "network_fail") {
                  return { data: null, error: { message: "network down" } };
                }
                if (kv.has(key)) return { data: { value: kv.get(key) }, error: null };
                return { data: null, error: null }; // key belum pernah diisi -- normal
              };
              const chain = {
                maybeSingle() {
                  const p = resolveMaybeSingle();
                  // maybeSingle() itself may also be followed by .abortSignal(signal)
                  // in production code, so keep supporting it on the returned promise.
                  p.abortSignal = () => chain.maybeSingle();
                  return p;
                },
                abortSignal(_signal) {
                  return chain;
                },
                then(resolve, reject) {
                  return resolveMaybeSingle().then(resolve, reject);
                }
              };
              return chain;
            }
          };
        },
        // saveData(): supa.from(...).upsert({key, value}), also chained with
        // .abortSignal(controller.signal) by the production overwrite guard.
        upsert({ key, value }) {
          const resolveUpsert = async () => {
            if (mode.write === "network_fail") {
              return { error: { message: "network down" } };
            }
            kv.set(key, value);
            return { error: null };
          };
          const chain = {
            abortSignal(_signal) {
              return chain;
            },
            then(resolve, reject) {
              return resolveUpsert().then(resolve, reject);
            }
          };
          return chain;
        }
      };
    },
    channel(_name) {
      return { on() { return this; }, subscribe() {} };
    },
    auth: {
      async getSession() { return { data: { session: authSession }, error: null }; },
      onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() { if (authCallback === cb) authCallback = null; } } } }; },
      async signInWithPassword({ email }) {
        authSession = { user: { id: "test-user", email } };
        if (authCallback) setTimeout(() => authCallback("SIGNED_IN", authSession), 0);
        return { data: { session: authSession }, error: null };
      },
      async signOut() {
        authSession = null;
        if (authCallback) setTimeout(() => authCallback("SIGNED_OUT", null), 0);
        return { error: null };
      }
    }
  };

  return {
    createClient(_url, _key) { return client; },
    _client: client,
    _kv: kv,
    _mode: mode,
    _auth: { get session() { return authSession; } }
  };
}

module.exports = { makeSupaMock };
