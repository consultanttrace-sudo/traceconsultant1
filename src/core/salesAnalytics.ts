export interface SaleLine {
  id: string; productName: string; menuCategory?: string; qty: number; unitPrice: number;
  channel: 'dine_in'|'gofood'|'grabfood'|'shopeefood'|'other'; outletId?: string; soldAt: string;
}
export interface BreakdownItem { label: string; value: number; sharePct: number; }

function amount(l: SaleLine): number { return l.qty * l.unitPrice; }

function rank(entries: Map<string, number>, limit = 5): BreakdownItem[] {
  const total = [...entries.values()].reduce((a, b) => a + b, 0);
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value, sharePct: total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0 }));
}

function bucketBy(lines: SaleLine[], keyFn: (l: SaleLine) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) { const k = keyFn(l); m.set(k, (m.get(k) ?? 0) + amount(l)); }
  return m;
}

const CHANNEL_LABEL: Record<SaleLine['channel'], string> = { dine_in: 'Dine-in', gofood: 'GoFood', grabfood: 'GrabFood', shopeefood: 'ShopeeFood', other: 'Lainnya' };

function priceRangeLabel(price: number): string {
  if (price <= 20000) return 'Rp 0 - Rp 20,000';
  if (price <= 40000) return 'Rp 20,001 - Rp 40,000';
  if (price <= 60000) return 'Rp 40,001 - Rp 60,000';
  if (price <= 80000) return 'Rp 60,001 - Rp 80,000';
  if (price <= 100000) return 'Rp 80,001 - Rp 100,000';
  return 'Rp 100,001+';
}

export interface SalesDashboard {
  totalRevenue: number;
  topProducts: BreakdownItem[];
  topCategories: BreakdownItem[];
  priceRanges: BreakdownItem[];
  topOutlets: BreakdownItem[];
  topHours: BreakdownItem[];
  topChannels: BreakdownItem[];
  monthlyRevenue: { period: string; value: number }[];
}

/** All breakdowns are computed from raw per-line sales — nothing here is estimated
 *  or backfilled; a period/outlet/channel with zero transactions yields an empty entry,
 *  not a fabricated share. */
export function buildSalesDashboard(lines: SaleLine[]): SalesDashboard {
  const totalRevenue = lines.reduce((s, l) => s + amount(l), 0);
  const topProducts = rank(bucketBy(lines, l => l.productName));
  const topCategories = rank(bucketBy(lines, l => l.menuCategory?.trim() || 'Tanpa kategori'));
  const priceRanges = rank(bucketBy(lines, l => priceRangeLabel(l.unitPrice)));
  const topOutlets = rank(bucketBy(lines, l => l.outletId?.trim() || 'Outlet tidak diketahui'));
  const topHours = rank(bucketBy(lines, l => { const h = new Date(l.soldAt).getHours(); return `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`; }));
  const topChannels = rank(bucketBy(lines, l => CHANNEL_LABEL[l.channel]), 5);
  const byMonth = new Map<string, number>();
  for (const l of lines) { const p = l.soldAt.slice(0, 7); byMonth.set(p, (byMonth.get(p) ?? 0) + amount(l)); }
  const monthlyRevenue = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, value]) => ({ period, value }));
  return { totalRevenue, topProducts, topCategories, priceRanges, topOutlets, topHours, topChannels, monthlyRevenue };
}
