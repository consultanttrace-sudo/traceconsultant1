// TRACE Analisa Konten & Medsos — pure types + evidence-first functions.
// Mirrors migrations 016-021. NO Supabase client here (pola sama seperti
// evidence.ts/aiDiagnostic.ts) — fetching data lewat backend/Edge Function
// terpisah, modul ini cuma mengolah data yang sudah diambil.
//
// STATUS: skeleton — dibangun 2026-09-12, belum ada Edge Function nyata di
// belakangnya (lihat CATATAN BELUM SELESAI di migration 016 & 020).

export type Platform = 'instagram' | 'tiktok';
export type SocialAccountStatus = 'connected' | 'expired' | 'revoked';
export type AttributionSource = 'utm_click' | 'manual_tag';
export type DataSource = 'platform_api' | 'manual';

export interface SocialAccount {
  id: string;
  clientId: string;
  isInternalAccount: boolean;
  platform: Platform;
  platformAccountId: string;
  displayName?: string | null;
  status: SocialAccountStatus;
  firstSyncedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

export interface ContentItem {
  id: string;
  clientId: string;
  platform: Platform;
  permalink?: string | null;
  contentType: 'reel' | 'post' | 'video' | 'other';
  caption?: string | null;
  postedAt: string;
  utmTag?: string | null;
}

// Metrik mentah per platform sebelum normalisasi — satuan beda-beda by design
// (addendum poin 4: reach IG vs views TikTok vs watch time YouTube).
export interface ContentMetricSnapshot {
  contentId: string;
  platform: Platform;
  reach?: number | null;
  impressions?: number | null;
  views?: number | null;
  saves?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  retentionCurve?: Array<{ second: number; pctRemaining: number }> | null;
  capturedAt: string;
}

export interface ContentInquiry {
  id: string;
  clientId: string;
  contentId?: string | null;
  attributionSource: AttributionSource;
  note?: string | null;
  closedRevenue?: number | null;
  createdAt: string;
}

export interface CompetitorAccount {
  id: string;
  clientId: string;
  platform: Platform;
  handle: string;
  niche?: string | null;
}

export interface CompetitorSnapshot {
  competitorId: string;
  followerCount?: number | null;
  mediaCount?: number | null;
  avgLikeCount?: number | null;
  avgCommentCount?: number | null;
  source: DataSource;
  capturedAt: string;
}

export interface RecommendationOutcome {
  id: string;
  clientId: string;
  recommendationType: string; // e.g. 'posting_time_2000'
  recommendedAt: string;
  outcomeMeasuredAt?: string | null;
  wasFollowed: boolean;
  wasSuccessful: boolean | null; // null = belum bisa diukur
}

// ---------------------------------------------------------------------------
// 1. Normalisasi metrik lintas platform (addendum poin 4)
// ---------------------------------------------------------------------------
// TIDAK menghasilkan satu angka "universal" yang menyamarkan satuan asli —
// cuma menghasilkan skor relatif (0-100 dalam kategori masing-masing) supaya
// AI bisa membandingkan tanpa mengklaim unit yang sama. `note` selalu
// menyertakan satuan asli untuk transparansi ke user.
export interface NormalizedEngagement {
  contentId: string;
  platform: Platform;
  engagementScore: number | null; // 0-100, relatif ke reach/views konten itu sendiri
  basis: 'reach' | 'views' | 'unavailable';
  note: string;
}

export function normalizeEngagement(item: ContentMetricSnapshot): NormalizedEngagement {
  const denominator = item.platform === 'instagram' ? item.reach : item.views;
  const engaged = (item.likeCount ?? 0) + (item.commentCount ?? 0) + (item.saves ?? 0);
  if (!denominator || denominator <= 0) {
    return { contentId: item.contentId, platform: item.platform, engagementScore: null, basis: 'unavailable', note: 'Denominator (reach/views) tidak tersedia dari API — tidak bisa dihitung, bukan diasumsikan 0.' };
  }
  const pct = Math.min(100, Math.round((engaged / denominator) * 10000) / 100);
  const basis = item.platform === 'instagram' ? 'reach' : 'views';
  return { contentId: item.contentId, platform: item.platform, engagementScore: pct, basis, note: `Dihitung dari (like+comment+save) / ${basis} — satuan asli tidak dikonversi ke platform lain.` };
}

// ---------------------------------------------------------------------------
// 2. Evidence-first anchoring untuk klaim AI (spec poin 3, WAJIB)
// ---------------------------------------------------------------------------
// Setiap klaim yang boleh dimunculkan AI harus tertaut ke datapoint konkret
// di sini — dipakai UI untuk render chart/tabel SEBELUM narasi AI muncul.
export interface ContentEvidencePoint {
  id: string;
  contentId: string;
  claim: string;
  metric: string;
  value: number | string;
  supportingDataRef: string; // mis. index di retentionCurve, dipakai UI untuk highlight titik yang sama
}

export function findRetentionDropEvidence(item: ContentMetricSnapshot, thresholdPct = 30): ContentEvidencePoint[] {
  if (!item.retentionCurve || item.retentionCurve.length < 2) return [];
  const points: ContentEvidencePoint[] = [];
  for (let i = 1; i < item.retentionCurve.length; i++) {
    const prev = item.retentionCurve[i - 1];
    const curr = item.retentionCurve[i];
    const drop = prev.pctRemaining - curr.pctRemaining;
    if (drop >= thresholdPct) {
      points.push({
        id: `retention-drop:${item.contentId}:${curr.second}`,
        contentId: item.contentId,
        claim: `Retention drop ${Math.round(drop)}% di detik ke-${curr.second}`,
        metric: 'retention_pct',
        value: curr.pctRemaining,
        supportingDataRef: `retentionCurve[${i}]`
      });
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// 3. Attribution — pisahkan klik tercatat vs manual (addendum poin 1, WAJIB)
// ---------------------------------------------------------------------------
export interface AttributionSummary {
  clientId: string;
  revenueFromTrackedClicks: number;
  revenueFromManualAttribution: number;
  countTrackedClicks: number;
  countManualAttribution: number;
  disclosureNote: string; // WAJIB ditampilkan bareng angka — jangan pernah digabung tanpa ini
}

export function summarizeAttribution(clientId: string, inquiries: ContentInquiry[]): AttributionSummary {
  const tracked = inquiries.filter(i => i.attributionSource === 'utm_click');
  const manual = inquiries.filter(i => i.attributionSource === 'manual_tag');
  const sum = (arr: ContentInquiry[]) => arr.reduce((acc, i) => acc + (i.closedRevenue ?? 0), 0);
  return {
    clientId,
    revenueFromTrackedClicks: sum(tracked),
    revenueFromManualAttribution: sum(manual),
    countTrackedClicks: tracked.length,
    countManualAttribution: manual.length,
    disclosureNote: 'Omset dari klik tercatat (presisi) ditampilkan terpisah dari omset atribusi manual/estimasi tim (perkiraan) — jangan dijumlahkan jadi satu angka tanpa keterangan ini.'
  };
}

// ---------------------------------------------------------------------------
// 4. Feedback loop / skor akurasi rekomendasi (spec poin 4 + addendum poin 2)
// ---------------------------------------------------------------------------
export interface RecommendationAccuracy {
  recommendationType: string;
  accuracyPct: number | null;
  sampleSize: number;
  measuredCount: number;
  confidenceNote: string; // WAJIB — tandai kalau sample masih kecil, jangan tampilkan sebagai "final"
}

export function computeRecommendationAccuracy(outcomes: RecommendationOutcome[], recommendationType: string, minSampleForConfidence = 20): RecommendationAccuracy {
  const relevant = outcomes.filter(o => o.recommendationType === recommendationType && o.wasFollowed);
  const measured = relevant.filter(o => o.wasSuccessful !== null);
  if (measured.length === 0) {
    return { recommendationType, accuracyPct: null, sampleSize: relevant.length, measuredCount: 0, confidenceNote: 'Belum ada hasil yang bisa diukur — skor akurasi belum bisa dihitung.' };
  }
  const successful = measured.filter(o => o.wasSuccessful === true).length;
  const accuracyPct = Math.round((successful / measured.length) * 10000) / 100;
  const confidenceNote = measured.length < minSampleForConfidence
    ? `Sample masih kecil (${measured.length} percobaan) — jangan ditampilkan sebagai skor final, tampilkan sebagai indikasi awal.`
    : `Berdasarkan ${measured.length} percobaan.`;
  return { recommendationType, accuracyPct, sampleSize: relevant.length, measuredCount: measured.length, confidenceNote };
}

// ---------------------------------------------------------------------------
// 5. Kesehatan koneksi akun — no silent fail (addendum poin 3, WAJIB)
// ---------------------------------------------------------------------------
export interface AccountHealthNotice {
  accountId: string;
  clientId: string;
  status: SocialAccountStatus;
  shouldNotifyClient: boolean;
  shouldNotifyTeam: boolean;
  message: string;
}

export function assessAccountHealth(account: SocialAccount): AccountHealthNotice | null {
  if (account.status === 'connected' && !account.lastSyncError) return null;
  const base = { accountId: account.id, clientId: account.clientId, status: account.status };
  if (account.status === 'expired') {
    return { ...base, shouldNotifyClient: true, shouldNotifyTeam: true, message: `Token akun ${account.platform} (${account.displayName ?? account.platformAccountId}) sudah expired — perlu re-auth.` };
  }
  if (account.status === 'revoked') {
    return { ...base, shouldNotifyClient: false, shouldNotifyTeam: true, message: `Akses akun ${account.platform} (${account.displayName ?? account.platformAccountId}) sudah dicabut.` };
  }
  if (account.lastSyncError) {
    return { ...base, shouldNotifyClient: false, shouldNotifyTeam: true, message: `Sync terakhir gagal: ${account.lastSyncError}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. Coverage historis dibatasi API (addendum poin 2)
// ---------------------------------------------------------------------------
export function historicalCoverageDays(account: SocialAccount, now: Date = new Date()): number | null {
  if (!account.firstSyncedAt) return null;
  const first = new Date(account.firstSyncedAt).getTime();
  return Math.max(0, Math.round((now.getTime() - first) / (1000 * 60 * 60 * 24)));
}
