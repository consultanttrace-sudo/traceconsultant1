import { assessEvidence, EvidenceItem } from './evidence.js';

export interface ScoreDimension {
  key: string;
  label: string;
  value: number | null;
  weight: number;
  evidence: string[];
}

export interface ScoreResult {
  score: number | null;
  dimensions: Array<ScoreDimension & { contribution: number | null }>;
  confidencePct: number | null;
  confidenceReason: string;
  evidence: ReturnType<typeof assessEvidence>;
  why: string[];
}

export function explainScore(dimensions: ScoreDimension[], evidenceItems: EvidenceItem[]): ScoreResult {
  // Missing dimension values are NOT zero. Only dimensions with an actual numeric
  // value participate in the score; their weights are renormalized over available
  // evidence so an unavailable dimension cannot silently depress or inflate the score.
  const available = dimensions.filter(d => d.value !== null && Number.isFinite(d.value));
  const totalWeight = available.reduce((s, d) => s + Math.max(0, d.weight), 0);
  const dimensionsWithContribution = dimensions.map(d => {
    const hasValue = d.value !== null && Number.isFinite(d.value);
    const value = hasValue ? clamp(d.value as number) : null;
    const contribution = hasValue && totalWeight > 0 ? (value! * Math.max(0, d.weight)) / totalWeight : null;
    return { ...d, value, contribution };
  });
  const score = totalWeight > 0
    ? Math.round(dimensionsWithContribution.reduce((s, d) => s + (d.contribution ?? 0), 0) * 100) / 100
    : null;
  const evidence = assessEvidence(evidenceItems);
  const confidencePct = evidenceItems.length ? evidence.completenessPct : null;
  const confidenceReason = `Evidence coverage ${confidencePct}% berasal langsung dari status evidence (available + manual) dibanding total evidence. Ini bukan probabilitas hasil bisnis dan tidak dinaikkan hanya karena jumlah dimensi.`;
  const why = dimensionsWithContribution.filter(d => d.value !== null && (d.contribution ?? 0) > 0).sort((a,b) => (b.contribution ?? 0)-(a.contribution ?? 0)).map(d => `${d.label}: ${d.value}/100, bobot ${d.weight}, kontribusi ${(d.contribution ?? 0).toFixed(2)}.`);
  return { score, dimensions: dimensionsWithContribution, confidencePct, confidenceReason, evidence, why };
}

function clamp(v: number) { return Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0)); }
