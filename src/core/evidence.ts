export type EvidenceStatus = 'available' | 'unavailable' | 'manual';

export interface EvidenceItem {
  id: string;
  metric: string;
  status: EvidenceStatus;
  value?: number | string | null;
  unit?: string;
  period?: string;
  source?: string;
  sourceUrl?: string;
  capturedAt?: string;
  notes?: string;
}

export interface EvidenceAssessment {
  total: number;
  available: number;
  unavailable: number;
  manual: number;
  completenessPct: number;
  missing: string[];
}

export function assessEvidence(items: EvidenceItem[]): EvidenceAssessment {
  const total = items.length;
  const available = items.filter(i => i.status === 'available').length;
  const unavailable = items.filter(i => i.status === 'unavailable').length;
  const manual = items.filter(i => i.status === 'manual').length;
  return {
    total,
    available,
    unavailable,
    manual,
    completenessPct: total ? Math.round(((available + manual) / total) * 10000) / 100 : 0,
    missing: items.filter(i => i.status === 'unavailable').map(i => i.metric)
  };
}

export function evidenceSourceLabel(item: EvidenceItem): string {
  if (item.status === 'manual') return 'Manual / Owner-provided';
  if (item.status === 'unavailable') return 'Tidak tersedia pada sumber yang diperoleh';
  return item.source || 'Source not recorded';
}
