/**
 * ============================================================================
 * PIUTANG USAHA (ACCOUNTS RECEIVABLE) + LAPORAN UMUR PIUTANG (AGING)
 * ============================================================================
 * Berguna untuk klien F&B yang melayani corporate/catering/event dengan
 * termin bayar (bukan cash langsung seperti dine-in biasa). Tanpa modul ini,
 * konsultan tidak bisa menjawab pertanyaan paling dasar: "klien mana yang
 * belum bayar, sudah berapa lama, dan berapa total uang yang masih nyangkut?"
 */

export interface ArInvoice {
  id: string;
  clientId: string;
  customerName: string;
  invoiceDate: string; // ISO date
  dueDate: string;     // ISO date
  amount: number;
}

export interface ArPayment {
  invoiceId: string;
  amount: number;
  paidDate: string; // ISO date
}

export type ArAgingBucket = 'belum_jatuh_tempo' | '0-30' | '31-60' | '61-90' | '>90';

export interface ArInvoiceStatus {
  invoice: ArInvoice;
  paidAmount: number;
  outstanding: number;
  status: 'lunas' | 'sebagian' | 'belum_dibayar';
  daysOverdue: number;
  agingBucket: ArAgingBucket;
}

export interface ArAgingSummary {
  asOfDate: string;
  buckets: Record<ArAgingBucket, number>;
  totalOutstanding: number;
  invoices: ArInvoiceStatus[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

/** Menyusun status pembayaran tiap invoice + laporan umur piutang per tanggal `asOfDate`. */
export function buildArAging(invoices: ArInvoice[], payments: ArPayment[], asOfDate: string): ArAgingSummary {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);

  const statuses: ArInvoiceStatus[] = invoices.map(invoice => {
    const paid = Math.round((paidByInvoice.get(invoice.id) ?? 0) * 100) / 100;
    const outstanding = Math.max(0, Math.round((invoice.amount - paid) * 100) / 100);
    const overdue = daysBetween(invoice.dueDate, asOfDate);

    let agingBucket: ArAgingBucket;
    if (overdue < 0) agingBucket = 'belum_jatuh_tempo';
    else if (overdue <= 30) agingBucket = '0-30';
    else if (overdue <= 60) agingBucket = '31-60';
    else if (overdue <= 90) agingBucket = '61-90';
    else agingBucket = '>90';

    const status: ArInvoiceStatus['status'] = outstanding <= 0 ? 'lunas' : paid > 0 ? 'sebagian' : 'belum_dibayar';
    return { invoice, paidAmount: paid, outstanding, status, daysOverdue: Math.max(0, overdue), agingBucket };
  });

  const buckets: Record<ArAgingBucket, number> = { belum_jatuh_tempo: 0, '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
  for (const s of statuses) if (s.outstanding > 0) buckets[s.agingBucket] += s.outstanding;

  return {
    asOfDate,
    buckets,
    totalOutstanding: Math.round(statuses.reduce((sum, s) => sum + s.outstanding, 0) * 100) / 100,
    invoices: statuses,
  };
}
