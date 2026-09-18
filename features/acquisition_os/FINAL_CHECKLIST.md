# TRACE Consultant OS V17 — Final Release Checklist

## Source inspected
- `index.html` is the production application source.
- `script_1.js` is not included and is not referenced.
- `tests_real/` contains tests that load the inline production code from `index.html`.

## Security
- Supabase Auth (email + password) is required before cloud data is opened.
- All authenticated team members keep full module access.
- JOBDESK remains a focus/workspace layer, not a permission layer.
- `SUPABASE_AUTH_RLS.sql` removes the old public read/write policy and allows only `authenticated` users to access `trace_kv`.
- The app does not silently fall back to localStorage when the configured production Supabase connection is unavailable during initial startup.

## Reliability / existing features
- Cloud storage readiness is still awaited before data modules read/write.
- Delete-safety and failure handling remain in the production-code test harness.
- History modal has an explicit close handler.
- Full client report export remains present.
- Accounting PDF / Excel / CSV exports remain present.
- Total JSON backup export/import remains present.
- Client PDF branding is TRACE Consultant.
- Client PDF text sanitization includes the bullet character and common UI symbols.

## Verification
- Production inline JavaScript: syntax check passed.
- Static release assertions: 13/13 passed.

## One external action required
After deploying this package, in Supabase:
1. Create the team member accounts under Authentication → Users.
2. Run `SUPABASE_AUTH_RLS.sql` in SQL Editor.
3. Confirm Realtime remains enabled for `trace_kv`.
4. Test login with two team accounts and confirm both see the same existing data.
