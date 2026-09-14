import assert from 'node:assert/strict';
import { computePieSlices } from '../dist/core/chartRender.js';

// Basic proportions: 3 categories, angles should sweep the full circle exactly once.
const slices = computePieSlices([{ label: 'COGS', value: 60 }, { label: 'Labor', value: 30 }, { label: 'OPEX', value: 10 }]);
assert.equal(slices.length, 3);
assert.equal(Math.round(slices[0].pct * 100), 60);
assert.equal(Math.round(slices[1].pct * 100), 30);
assert.equal(Math.round(slices[2].pct * 100), 10);
const fullSweep = slices[slices.length - 1].endAngle - slices[0].startAngle;
assert.ok(Math.abs(fullSweep - Math.PI * 2) < 1e-9, 'slices must sweep exactly one full circle');

// Zero/negative values are excluded, never rendered as a slice.
const withZero = computePieSlices([{ label: 'A', value: 100 }, { label: 'B', value: 0 }, { label: 'C', value: -5 }]);
assert.equal(withZero.length, 1);
assert.equal(withZero[0].label, 'A');

// All-zero/empty input returns no slices instead of dividing by zero.
assert.deepEqual(computePieSlices([]), []);
assert.deepEqual(computePieSlices([{ label: 'A', value: 0 }]), []);

console.log('chart render (pie slice math): PASS');
