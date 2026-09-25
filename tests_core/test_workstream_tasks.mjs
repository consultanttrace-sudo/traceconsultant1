import assert from 'node:assert/strict';
import { taskDraftFromFinding } from '../dist/core/workstreams.js';

const NOW = '2026-09-21T00:00:00.000Z';

// Temuan 'ok' dan 'nodata' tidak boleh jadi tugas — hanya yang menyala (flagged) atau perlu asesmen manual.
const okFinding = { key: 'foodcost', label: 'Food Cost / COGS', group: 'Keuangan', status: 'ok', severity: null, reason: 'COGS 30% dari revenue, target ≤35%.', module: 'recipecogs', moduleLabel: 'Recipe COGS' };
assert.equal(taskDraftFromFinding(okFinding, NOW), null);
const nodataFinding = { ...okFinding, status: 'nodata' };
assert.equal(taskDraftFromFinding(nodataFinding, NOW), null);

// Severity tinggi → tenggat 3 hari, prioritas P1.
const highFinding = { key: 'foodcost', label: 'Food Cost / COGS', group: 'Keuangan', status: 'flagged', severity: 'high', reason: 'COGS 48% dari revenue, target ≤35%.', module: 'recipecogs', moduleLabel: 'Recipe COGS' };
const highDraft = taskDraftFromFinding(highFinding, NOW);
assert.equal(highDraft.title, 'Food Cost / COGS');
assert.equal(highDraft.priority, 'P1');
assert.equal(highDraft.dueDateIso, '2026-09-24T00:00:00.000Z');
assert.match(highDraft.evidenceNote, /jalur:foodcost — COGS 48%/);
assert.equal(highDraft.module, 'recipecogs');

// Severity medium → 7 hari, P2. Severity low → 14 hari, P3.
const mediumFinding = { ...highFinding, severity: 'medium' };
assert.equal(taskDraftFromFinding(mediumFinding, NOW).priority, 'P2');
assert.equal(taskDraftFromFinding(mediumFinding, NOW).dueDateIso, '2026-09-28T00:00:00.000Z');
const lowFinding = { ...highFinding, severity: 'low' };
assert.equal(taskDraftFromFinding(lowFinding, NOW).priority, 'P3');
assert.equal(taskDraftFromFinding(lowFinding, NOW).dueDateIso, '2026-10-05T00:00:00.000Z');

// Area tanpa data otomatis (manual) → judul diberi awalan "Asesmen langsung", P2, 14 hari.
const manualFinding = { key: 'branding', label: 'Branding', group: 'Pertumbuhan', status: 'manual', severity: null, reason: 'Nilai identitas brand, positioning, dan seberapa dikenal di area.', module: 'marketing', moduleLabel: 'Marketing' };
const manualDraft = taskDraftFromFinding(manualFinding, NOW);
assert.equal(manualDraft.title, 'Asesmen langsung: Branding');
assert.equal(manualDraft.priority, 'P2');
assert.equal(manualDraft.dueDateIso, '2026-10-05T00:00:00.000Z');
assert.match(manualDraft.evidenceNote, /jalur:branding/);

console.log('PASS workstream task draft (owner diisi pemanggil; due date & evidence dari kondisi klien)');
