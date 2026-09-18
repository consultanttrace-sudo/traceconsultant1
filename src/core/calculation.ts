export interface CalculationInput {
  current: number;
  previous?: number | null;
  metric: string;
  currentPeriod: string;
  previousPeriod?: string;
  source: string;
}

export interface CalculationResult {
  metric: string;
  current: number;
  previous: number | null;
  change: number | null;
  changePct: number | null;
  formula: string;
  source: string;
  currentPeriod: string;
  previousPeriod: string | null;
  status: 'calculated' | 'insufficient_data' | 'undefined_baseline';
  explanation: string;
}

export function calculateChange(input: CalculationInput): CalculationResult {
  const { current, previous = null } = input;
  if (!Number.isFinite(current)) {
    return { ...base(input), change: null, changePct: null, status: 'insufficient_data', explanation: 'Data belum cukup untuk menghitung perubahan.' };
  }
  if (previous === null || !Number.isFinite(previous)) {
    return { ...base(input), change: null, changePct: null, status: 'insufficient_data', explanation: 'Data periode pembanding tidak tersedia.' };
  }
  const change = current - previous;
  if (previous === 0) {
    return { ...base(input), change, changePct: null, status: 'undefined_baseline', explanation: `Perubahan absolut ${format(current)} - ${format(previous)} = ${format(change)}. Persentase tidak dihitung karena baseline 0.` };
  }
  const changePct = (change / previous) * 100;
  const direction = change > 0 ? 'meningkat' : change < 0 ? 'menurun' : 'tetap';
  return {
    ...base(input), change, changePct,
    status: 'calculated',
    explanation: `${input.metric} ${input.currentPeriod} ${format(current)} dibanding ${input.previousPeriod || 'periode sebelumnya'} ${format(previous)} → ${direction} ${format(changePct)}%. Formula: (current - previous) / previous × 100.`
  };
}

function base(input: CalculationInput) {
  return {
    metric: input.metric,
    current: input.current,
    previous: input.previous ?? null,
    formula: '(current - previous) / previous × 100',
    source: input.source,
    currentPeriod: input.currentPeriod,
    previousPeriod: input.previousPeriod ?? null
  };
}

function format(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(2); }
