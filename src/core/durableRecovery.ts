// durableRecovery.ts
// Local-only recovery/checkpoint store for in-progress work (e.g. Data Intake drafts).
// This is a client-side safety net (localStorage-backed) — it never talks to Supabase
// or any production ledger. Its only job is to let a user resume a draft they were
// editing if the tab/browser closed before they finished.
//
// NOTE: this file was missing from the TRACE_v64_AUDITED package (main.tsx imports it
// but it did not exist anywhere in the archive). Reconstructed from the call-site
// contract in src/app/main.tsx. Please diff against your own git history / last known
// good version if you have one — this is a best-effort reimplementation, not a recovered
// original.

export type RecoverySnapshot<T> = {
  id: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  sourceName?: string;
  sourceHash?: string;
  status: string;
  data: T;
};

const STORAGE_PREFIX = 'trace:recovery:';

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function storageKey(kind: string): string {
  return `${STORAGE_PREFIX}${kind}`;
}

function readAll<T>(kind: string): RecoverySnapshot<T>[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(storageKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecoverySnapshot<T>[]) : [];
  } catch {
    return [];
  }
}

function writeAll<T>(kind: string, rows: RecoverySnapshot<T>[]): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(rows));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — fail silently,
    // this is a best-effort convenience feature, not a durability guarantee.
  }
}

function allKnownKinds(): string[] {
  if (!hasLocalStorage()) return [];
  const kinds: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        kinds.push(key.slice(STORAGE_PREFIX.length));
      }
    }
  } catch {
    return [];
  }
  return kinds;
}

/** List saved snapshots for a given kind, most recently updated first. */
export async function listRecoverySnapshots<T>(kind: string): Promise<RecoverySnapshot<T>[]> {
  const rows = readAll<T>(kind);
  return [...rows].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** Create or update (upsert by id) a snapshot within its kind's bucket. */
export async function saveRecoverySnapshot<T>(snapshot: RecoverySnapshot<T>): Promise<void> {
  const rows = readAll<T>(snapshot.kind);
  const idx = rows.findIndex((row) => row.id === snapshot.id);
  if (idx >= 0) {
    rows[idx] = snapshot;
  } else {
    rows.unshift(snapshot);
  }
  writeAll(snapshot.kind, rows);
}

/**
 * Delete a snapshot by id. The kind isn't known at call sites that only hold
 * an id (see main.tsx), so this scans all known kind buckets.
 */
export async function deleteRecoverySnapshot(id: string): Promise<void> {
  for (const kind of allKnownKinds()) {
    const rows = readAll(kind);
    const filtered = rows.filter((row) => row.id !== id);
    if (filtered.length !== rows.length) {
      writeAll(kind, filtered);
    }
  }
}
