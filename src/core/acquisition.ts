export const ACQUISITION_STAGES = [
  'discovery', 'raw_leads', 'normalized', 'deduplicated', 'enriched',
  'analyzed', 'qualified', 'prioritized', 'outreach', 'response',
  'meeting', 'proposal', 'client'
] as const;
export type AcquisitionStage = typeof ACQUISITION_STAGES[number];

export type AcquisitionLead = {
  id: string;
  businessName: string;
  category?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  address?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  outletCount?: number | null;
  source?: string | null;
  externalId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fitScore?: number | null;
  status?: string | null;
};

export type AcquisitionEvidence = {
  field: string;
  value: unknown;
  source?: string | null;
  available: boolean;
};

export type ProblemHypothesis = {
  title: string;
  rationale: string;
  evidenceFields: string[];
  status: 'hypothesis' | 'validated' | 'rejected';
};

export type Qualification = {
  fitScore: number;
  dataCoveragePct: number;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  fitStatus: 'high' | 'medium' | 'low' | 'insufficient_data';
  reasons: string[];
  hypotheses: ProblemHypothesis[];
};

export type PipelineMetrics = {
  total: number;
  byStage: Record<AcquisitionStage, number>;
  qualified: number;
  prioritized: number;
  contactable: number;
  conversionRate: number | null;
};

const has = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== 'Unknown' && v !== 'Not Found';
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function normalizeLead(input: AcquisitionLead): AcquisitionLead {
  return {
    ...input,
    businessName: String(input.businessName || '').trim(),
    category: has(input.category) ? String(input.category).trim() : null,
    city: has(input.city) ? String(input.city).trim() : null,
    phone: has(input.phone) ? String(input.phone).trim() : null,
    website: has(input.website) ? String(input.website).trim() : null,
    instagram: has(input.instagram) ? String(input.instagram).trim() : null,
    address: has(input.address) ? String(input.address).trim() : null,
    rating: typeof input.rating === 'number' && Number.isFinite(input.rating) ? input.rating : null,
    reviewCount: typeof input.reviewCount === 'number' && Number.isFinite(input.reviewCount) ? input.reviewCount : null,
    outletCount: typeof input.outletCount === 'number' && Number.isFinite(input.outletCount) ? input.outletCount : null,
  };
}

export function deduplicateLeads(leads: AcquisitionLead[]): AcquisitionLead[] {
  const out: AcquisitionLead[] = [];
  const seen = new Set<string>();
  for (const raw of leads) {
    const lead = normalizeLead(raw);
    const keys = [
      lead.externalId ? `id:${lead.externalId}` : '',
      has(lead.phone) ? `phone:${String(lead.phone).replace(/\D/g, '').replace(/^62/, '0')}` : '',
      has(lead.website) ? `web:${String(lead.website).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')}` : '',
      has(lead.instagram) ? `ig:${String(lead.instagram).toLowerCase().replace(/^@/, '').replace(/\/$/, '')}` : '',
      `name:${lead.businessName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${String(lead.city || '').toLowerCase().trim()}`
    ].filter(Boolean);
    if (keys.some(k => seen.has(k))) continue;
    keys.forEach(k => seen.add(k));
    out.push(lead);
  }
  return out;
}

export function qualifyLead(lead: AcquisitionLead, evidence: AcquisitionEvidence[] = []): Qualification {
  const l = normalizeLead(lead);
  const available = new Set(evidence.filter(e => e.available && has(e.value)).map(e => e.field));
  const reasons: string[] = [];
  let score = 0;

  // Fit is consulting potential, not data availability. Data completeness is
  // reported separately so a well-documented but low-fit business cannot score
  // highly merely because it has many fields populated.
  const category = String(l.category || '').toLowerCase();
  const isTargetFnb = /coffee|cafe|café|restaurant|resto|bakery|dessert|food|kuliner|kedai/.test(category);
  if (isTargetFnb) { score += 20; reasons.push('Kategori bisnis sesuai target F&B consulting.'); }
  else if (has(l.category)) reasons.push('Kategori tersedia, tetapi kecocokan F&B belum terkonfirmasi.');

  if (typeof l.outletCount === 'number') {
    if (l.outletCount >= 5) { score += 30; reasons.push('Multi-outlet skala tinggi memberi sinyal kebutuhan kontrol dan standardisasi.'); }
    else if (l.outletCount >= 2) { score += 20; reasons.push('Multi-outlet memberi sinyal kebutuhan scaling dan operational control.'); }
    else if (l.outletCount === 1) { score += 5; reasons.push('Single outlet memiliki potensi consulting, tetapi kompleksitas operasional belum tinggi.'); }
  }

  if (typeof l.reviewCount === 'number') {
    if (l.reviewCount >= 1000) { score += 15; reasons.push('Traction publik tinggi memberi basis untuk menguji growth/operations opportunity.'); }
    else if (l.reviewCount >= 300) { score += 10; reasons.push('Traction publik cukup untuk contextual business analysis.'); }
    else if (l.reviewCount >= 50) { score += 5; reasons.push('Ada traction publik yang dapat digunakan sebagai evidence awal.'); }
  }

  const digitalSignals = Number(has(l.website)) + Number(has(l.instagram));
  if (digitalSignals === 2) { score += 15; reasons.push('Website dan Instagram tersedia untuk menguji digital-to-business opportunity.'); }
  else if (digitalSignals === 1) { score += 8; reasons.push('Satu digital presence tersedia untuk analisis lanjutan.'); }

  if (has(l.phone)) { score += 5; reasons.push('Kontak tersedia sehingga lead dapat ditindaklanjuti.'); }
  if (available.has('revenue') || available.has('cogs') || available.has('labor') || available.has('opex')) {
    score += 15;
    reasons.push('Ada evidence finansial yang dapat membuka diagnosis profitability.');
  }

  score = clamp(score);
  const expectedFields = ['category','city','phone','website','instagram','address','rating','reviewCount','outletCount'];
  const coveragePct = Math.round((expectedFields.filter(field => has((l as Record<string, unknown>)[field])).length / expectedFields.length) * 100);

  const hypotheses: ProblemHypothesis[] = [];
  if ((l.outletCount || 0) > 1) hypotheses.push({
    title: 'Scaling / operational control',
    rationale: 'Multi-outlet is a scale signal; it does not prove an operational problem.',
    evidenceFields: ['outletCount'], status: 'hypothesis'
  });
  if ((l.reviewCount || 0) >= 500 && has(l.instagram)) hypotheses.push({
    title: 'Content-to-conversion opportunity',
    rationale: 'Public traction plus digital presence creates a reason to test conversion, not a claim that conversion is weak.',
    evidenceFields: ['reviewCount', 'instagram'], status: 'hypothesis'
  });
  if (available.has('revenue') || available.has('cogs') || available.has('labor') || available.has('opex')) hypotheses.push({
    title: 'Profitability diagnosis opportunity',
    rationale: 'Financial evidence is available for diagnosis; no specific financial problem is claimed until calculation confirms it.',
    evidenceFields: ['revenue', 'cogs', 'labor', 'opex'].filter(x => available.has(x)), status: 'hypothesis'
  });
  if (!hypotheses.length) hypotheses.push({
    title: 'Business system opportunity requires validation',
    rationale: 'Public evidence is insufficient to assert a specific pain point.',
    evidenceFields: [], status: 'hypothesis'
  });

  const fitStatus = score >= 75 ? 'high' : score >= 50 ? 'medium' : score > 0 ? 'low' : 'insufficient_data';
  const priority = fitStatus === 'high' ? 'P1' : fitStatus === 'medium' ? 'P2' : fitStatus === 'low' ? 'P3' : 'P4';
  return { fitScore: score, dataCoveragePct: coveragePct, priority, fitStatus, reasons, hypotheses };
}

type AcquisitionPipelineLead = AcquisitionLead & { acquisitionStage?: AcquisitionStage | null; status?: string | null; fitStatus?: Qualification['fitStatus']; priority?: Qualification['priority'] | null };

export function buildPipelineMetrics(leads: AcquisitionPipelineLead[]): PipelineMetrics {
  const byStage = Object.fromEntries(ACQUISITION_STAGES.map(s => [s, 0])) as Record<AcquisitionStage, number>;
  for (const lead of leads) {
    if (lead.acquisitionStage && lead.acquisitionStage in byStage) byStage[lead.acquisitionStage] += 1;
  }
  const qualified = leads.filter(l => ['high','medium'].includes(l.fitStatus ?? 'insufficient_data') || (!l.fitStatus && typeof l.fitScore === 'number' && l.fitScore >= 50)).length;
  const prioritized = leads.filter(l => ['P1','P2','P3'].includes(l.priority ?? 'P4') || (!l.priority && typeof l.fitScore === 'number')).length;
  const contactable = leads.filter(l => has(l.phone) || has(l.instagram) || has(l.website)).length;
  const clients = byStage.client;
  return {
    total: leads.length,
    byStage,
    qualified,
    prioritized,
    contactable,
    conversionRate: prioritized > 0 ? Number(((clients / prioritized) * 100).toFixed(2)) : null,
  };
}
