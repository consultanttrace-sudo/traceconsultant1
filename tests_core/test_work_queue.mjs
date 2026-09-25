import assert from 'node:assert/strict';
import { buildWorkQueue, bucketFor, dueLabel, normalizeStatus, normalizePriority } from '../dist/core/workQueue.js';

const now = new Date(2026, 8, 21, 10, 0, 0); // 21 Sep 2026, local time
const at = (dayOffset, hour = 12) => new Date(2026, 8, 21 + dayOffset, hour, 0, 0).toISOString();
const t = (id, clientId, over = {}) => ({ id, clientId, clientName: clientId.toUpperCase(), title: `Tugas ${id}`, status: 'open', priority: 'P2', dueDate: at(2), ...over });

const tasks = [
  t('late', 'a', { dueDate: at(-3), priority: 'P1' }),
  t('today', 'a', { dueDate: at(0, 23) }),
  t('tomorrow', 'b', { dueDate: at(1) }),
  t('blocked', 'b', { status: 'blocked', dueDate: at(4), priority: 'P0' }),
  t('later', 'b', { dueDate: at(30) }),
  t('nodate', 'a', { dueDate: null }),
  t('done', 'c', { status: 'done', dueDate: at(-10) }),
  t('cancelled', 'c', { status: 'cancelled', dueDate: at(-10) })
];
const clients = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
const q = buildWorkQueue(tasks, clients, now, 20);

assert.equal(q.openTotal, 6, 'done and cancelled never appear in the queue');
assert.deepEqual(q.counts, { overdue: 1, blocked: 1, today: 1, week: 1, later: 1, nodate: 1 });
assert.deepEqual(q.items.map(i => i.task.id), ['late', 'blocked', 'today', 'tomorrow', 'later', 'nodate'], 'overdue → blocked → today → this week → later → no date');
assert.deepEqual(q.clientsWithoutTasks.map(c => c.id), ['c', 'd'], 'clients with only done/cancelled tasks still need a plan');

// a late task stays "overdue" even when it is also blocked; a blocked task with a future date is "blocked"
assert.equal(bucketFor(t('x', 'a', { status: 'blocked', dueDate: at(-1) }), now).bucket, 'overdue');
assert.equal(bucketFor(t('y', 'a', { status: 'blocked', dueDate: at(3) }), now).bucket, 'blocked');
assert.equal(bucketFor(t('z', 'a', { dueDate: 'bukan-tanggal' }), now).bucket, 'nodate', 'unparseable date is treated as no date, not as today');

// same-day tasks are "today" regardless of the hour
assert.equal(bucketFor(t('h1', 'a', { dueDate: at(0, 0) }), now).bucket, 'today');
assert.equal(bucketFor(t('h2', 'a', { dueDate: at(0, 23) }), now).bucket, 'today');

// priority breaks ties inside a bucket
const tie = buildWorkQueue([t('p3', 'a', { priority: 'P3', dueDate: at(2) }), t('p0', 'a', { priority: 'P0', dueDate: at(2) })], clients, now);
assert.deepEqual(tie.items.map(i => i.task.id), ['p0', 'p3']);

assert.equal(buildWorkQueue(tasks, clients, now, 2).items.length, 2, 'limit trims the list but not the counts');
assert.equal(buildWorkQueue(tasks, clients, now, 2).counts.later, 1);

const labels = Object.fromEntries(q.items.map(i => [i.task.id, dueLabel(i)]));
assert.equal(labels.late, 'Terlambat 3 hari');
assert.equal(labels.today, 'Hari ini');
assert.equal(labels.tomorrow, 'Besok');
assert.equal(labels.blocked, 'Terblokir');
assert.equal(labels.later, '30 hari lagi');
assert.equal(labels.nodate, 'Tanpa tenggat');

assert.equal(normalizeStatus('weird'), 'open');
assert.equal(normalizeStatus('IN_PROGRESS'), 'in_progress');
assert.equal(normalizePriority('p1'), 'P1');
assert.equal(normalizePriority(null), 'P2');
assert.deepEqual(buildWorkQueue([], [], now).items, []);
console.log('PASS work queue');
