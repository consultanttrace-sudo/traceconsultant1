/**
 * Cross-client work queue ("apa yang harus dikerjakan hari ini").
 * Built only from persisted collaboration tasks; a client with no open task is reported as such
 * instead of being hidden, because "no plan" is itself something the team needs to see.
 */
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type QueueBucket = 'overdue' | 'blocked' | 'today' | 'week' | 'later' | 'nodate';

export interface WorkTaskInput {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO timestamp or null. */
  dueDate: string | null;
}

export interface WorkQueueItem {
  task: WorkTaskInput;
  bucket: QueueBucket;
  /** Whole calendar days from today to the due date (negative = late). null when no due date. */
  daysFromToday: number | null;
}

export interface WorkQueue {
  items: WorkQueueItem[];
  counts: Record<QueueBucket, number>;
  openTotal: number;
  /** Clients that have no open task at all. */
  clientsWithoutTasks: Array<{ id: string; name: string }>;
}

const OPEN = new Set<string>(['open', 'in_progress', 'blocked']);
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const BUCKET_RANK: Record<QueueBucket, number> = { overdue: 0, blocked: 1, today: 2, week: 3, later: 4, nodate: 5 };

const dayIndex = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

export function normalizeStatus(v: unknown): TaskStatus {
  const s = String(v ?? '').toLowerCase();
  return s === 'in_progress' || s === 'blocked' || s === 'done' || s === 'cancelled' ? s : 'open';
}
export function normalizePriority(v: unknown): TaskPriority {
  const s = String(v ?? '').toUpperCase();
  return s === 'P0' || s === 'P1' || s === 'P3' ? s : 'P2';
}

export function bucketFor(task: WorkTaskInput, now: Date): { bucket: QueueBucket; daysFromToday: number | null } {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const validDue = due && Number.isFinite(due.getTime()) ? due : null;
  const days = validDue ? dayIndex(validDue) - dayIndex(now) : null;
  if (days !== null && days < 0) return { bucket: 'overdue', daysFromToday: days };
  if (task.status === 'blocked') return { bucket: 'blocked', daysFromToday: days };
  if (days === null) return { bucket: 'nodate', daysFromToday: null };
  if (days === 0) return { bucket: 'today', daysFromToday: 0 };
  if (days <= 7) return { bucket: 'week', daysFromToday: days };
  return { bucket: 'later', daysFromToday: days };
}

export function buildWorkQueue(tasks: WorkTaskInput[], clients: Array<{ id: string; name: string }>, now: Date = new Date(), limit = 8): WorkQueue {
  const open = tasks.filter(t => OPEN.has(t.status));
  const all: WorkQueueItem[] = open.map(task => ({ task, ...bucketFor(task, now) }));
  const counts: Record<QueueBucket, number> = { overdue: 0, blocked: 0, today: 0, week: 0, later: 0, nodate: 0 };
  all.forEach(i => { counts[i.bucket] += 1; });
  const sorted = [...all].sort((a, b) =>
    (BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]) ||
    ((a.daysFromToday ?? 9999) - (b.daysFromToday ?? 9999)) ||
    (PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority]) ||
    a.task.title.localeCompare(b.task.title));
  const withTasks = new Set(open.map(t => t.clientId));
  return {
    items: sorted.slice(0, limit),
    counts,
    openTotal: open.length,
    clientsWithoutTasks: clients.filter(c => !withTasks.has(c.id))
  };
}

export function dueLabel(item: WorkQueueItem): string {
  const d = item.daysFromToday;
  if (item.bucket === 'blocked' && (d === null || d >= 0)) return 'Terblokir';
  if (d === null) return 'Tanpa tenggat';
  if (d < 0) return `Terlambat ${-d} hari`;
  if (d === 0) return 'Hari ini';
  if (d === 1) return 'Besok';
  return `${d} hari lagi`;
}
