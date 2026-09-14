import assert from 'node:assert/strict';
import {
  normalizeEngagement,
  findRetentionDropEvidence,
  summarizeAttribution,
  computeRecommendationAccuracy,
  assessAccountHealth,
  historicalCoverageDays
} from '../dist/core/content.js';

// 1. normalizeEngagement — unavailable denominator must not silently become 0
const noReach = normalizeEngagement({ contentId: 'c1', platform: 'instagram', reach: null, likeCount: 10, commentCount: 2, saves: 1, capturedAt: 'now' });
assert.equal(noReach.engagementScore, null);
assert.equal(noReach.basis, 'unavailable');

const withReach = normalizeEngagement({ contentId: 'c2', platform: 'instagram', reach: 1000, likeCount: 80, commentCount: 20, saves: 0, capturedAt: 'now' });
assert.equal(withReach.engagementScore, 10);
assert.equal(withReach.basis, 'reach');

// 2. findRetentionDropEvidence — must anchor to a specific curve point
const drops = findRetentionDropEvidence({
  contentId: 'c3', platform: 'tiktok', capturedAt: 'now',
  retentionCurve: [ { second: 0, pctRemaining: 100 }, { second: 3, pctRemaining: 55 }, { second: 6, pctRemaining: 50 } ]
});
assert.equal(drops.length, 1);
assert.match(drops[0].claim, /detik ke-3/);
assert.equal(drops[0].supportingDataRef, 'retentionCurve[1]');

// 3. summarizeAttribution — tracked vs manual must stay separate, never merged silently
const attribution = summarizeAttribution('client-1', [
  { id: 'i1', clientId: 'client-1', attributionSource: 'utm_click', closedRevenue: 5000000, createdAt: 'now' },
  { id: 'i2', clientId: 'client-1', attributionSource: 'manual_tag', closedRevenue: 2000000, createdAt: 'now' }
]);
assert.equal(attribution.revenueFromTrackedClicks, 5000000);
assert.equal(attribution.revenueFromManualAttribution, 2000000);
assert.match(attribution.disclosureNote, /jangan dijumlahkan/);

// 4. computeRecommendationAccuracy — small sample must be flagged, not shown as final
const smallSample = computeRecommendationAccuracy([
  { id: 'r1', clientId: 'client-1', recommendationType: 'posting_time_2000', recommendedAt: 'now', wasFollowed: true, wasSuccessful: true },
  { id: 'r2', clientId: 'client-1', recommendationType: 'posting_time_2000', recommendedAt: 'now', wasFollowed: true, wasSuccessful: false }
], 'posting_time_2000');
assert.equal(smallSample.accuracyPct, 50);
assert.match(smallSample.confidenceNote, /Sample masih kecil/);

// 5. assessAccountHealth — expired must notify both client and team, revoked only team
const expired = assessAccountHealth({ id: 'a1', clientId: 'client-1', isInternalAccount: false, platform: 'instagram', platformAccountId: 'p1', status: 'expired' });
assert.equal(expired.shouldNotifyClient, true);
assert.equal(expired.shouldNotifyTeam, true);

const revoked = assessAccountHealth({ id: 'a2', clientId: 'client-1', isInternalAccount: false, platform: 'instagram', platformAccountId: 'p2', status: 'revoked' });
assert.equal(revoked.shouldNotifyClient, false);
assert.equal(revoked.shouldNotifyTeam, true);

const healthy = assessAccountHealth({ id: 'a3', clientId: 'client-1', isInternalAccount: false, platform: 'instagram', platformAccountId: 'p3', status: 'connected' });
assert.equal(healthy, null);

// 6. historicalCoverageDays — no first_synced_at means unknown, not zero
assert.equal(historicalCoverageDays({ id: 'a4', clientId: 'client-1', isInternalAccount: false, platform: 'instagram', platformAccountId: 'p4', status: 'connected' }), null);

console.log('Content (Analisa Konten & Medsos) skeleton regression: PASS');
