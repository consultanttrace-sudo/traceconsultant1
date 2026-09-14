/**
 * ============================================================================
 * UTANG USAHA (ACCOUNTS PAYABLE) + LAPORAN UMUR UTANG (AGING)
 * ============================================================================
 * Kebalikan dari accountsReceivable.ts: melacak tagihan dari SUPPLIER (bahan
 * baku, sewa, dll) yang belum dibayar klien. Ini krusial untuk F&B karena
 * arus kas yang sehat sering rusak bukan karena tidak untung, tapi karena
 * telat bayar supplier sampai kena penalti atau putus pasokan.
 */

export interface ApBill {
  id: string;
  clientId: string;
  vendorName: string;
  billDate: string; // ISO date
  dueDate: string;  // ISO date
  amount: number;
}

export interface ApPayment {
  billId: string;
  amount: number;
  paidDate: string; // ISO date
}

export type ApAgingBucket = 'belum_jatuh_tempo' | '0-30' | '31-60' | '61-90' | '>90';

export interface ApBillStatus {
  bill: ApBill;
  paidAmount: number;
  outstanding: number;
  status: 'lunas' | 'sebagian' | 'belum_dibayar';
  daysOverdue: number;
  agingBucket: ApAgingBucket;
}

export interface ApAgingSummary {
  asOfDate: string;
  buckets: Record<ApAgingBucket, number>;
  totalOutstanding: number;
  bills: ApBillStatus[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

export function buildApAging(bills: ApBill[], payments: ApPayment[], asOfDate: string): ApAgingSummary {
  const paidByBill = new Map<string, number>();
  for (const p of payments) paidByBill.set(p.billId, (paidByBill.get(p.billId) ?? 0) + p.amount);

  const statuses: ApBillStatus[] = bills.map(bill => {
    const paid = Math.round((paidByBill.get(bill.id) ?? 0) * 100) / 100;
    const outstanding = Math.max(0, Math.round((bill.amount - paid) * 100) / 100);
    const overdue = daysBetween(bill.dueDate, asOfDate);

    let agingBucket: ApAgingBucket;
    if (overdue < 0) agingBucket = 'belum_jatuh_tempo';
    else if (overdue <= 30) agingBucket = '0-30';
    else if (overdue <= 60) agingBucket = '31-60';
    else if (overdue <= 90) agingBucket = '61-90';
    else agingBucket = '>90';

    const status: ApBillStatus['status'] = outstanding <= 0 ? 'lunas' : paid > 0 ? 'sebagian' : 'belum_dibayar';
    return { bill, paidAmount: paid, outstanding, status, daysOverdue: Math.max(0, overdue), agingBucket };
  });

  const buckets: Record<ApAgingBucket, number> = { belum_jatuh_tempo: 0, '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
  for (const s of statuses) if (s.outstanding > 0) buckets[s.agingBucket] += s.outstanding;

  return {
    asOfDate,
    buckets,
    totalOutstanding: Math.round(statuses.reduce((sum, s) => sum + s.outstanding, 0) * 100) / 100,
    bills: statuses,
  };
}
