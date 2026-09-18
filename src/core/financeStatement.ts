import type { FinanceRecord, FinanceStatementSection } from './finance.js';

export interface StatementLine { label: string; amount: number; }
export interface StatementGroup { section: FinanceStatementSection; title: string; lines: StatementLine[]; total: number; }
export interface IncomeStatement {
  period: string;
  pendapatanUsaha: StatementGroup;
  biayaProduksi: StatementGroup;
  biayaUsahaLain: StatementGroup;
  totalBiayaAtasPendapatan: number;
  labaKotor: number;
  biayaOperasional: StatementGroup;
  biayaNonOperasional: StatementGroup;
  totalPengeluaranOperasional: number;
  labaOperasi: number;
  pendapatanLain: StatementGroup;
  pengeluaranLain: StatementGroup;
  labaBersih: number;
  /** Records with no statementSection set (legacy flat entries) — surfaced so nothing is silently dropped. */
  unclassified: StatementLine[];
}

const SECTION_TITLES: Record<FinanceStatementSection, string> = {
  pendapatan_usaha: 'Pendapatan Usaha', biaya_produksi: 'Biaya Produksi', biaya_usaha_lain: 'Biaya Usaha Lain',
  biaya_operasional: 'Biaya Operasional', biaya_non_operasional: 'Biaya Non Operasional',
  pendapatan_lain: 'Pendapatan Lain', pengeluaran_lain: 'Pengeluaran Lain',
};

function group(records: FinanceRecord[], section: FinanceStatementSection): StatementGroup {
  const rows = records.filter(r => r.statementSection === section);
  const lines = rows.map(r => ({ label: r.accountLabel?.trim() || SECTION_TITLES[section], amount: r.amount }));
  return { section, title: SECTION_TITLES[section], lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** Builds a hierarchical income statement for one period. Sections with zero classified
 *  records still render (with an empty lines array, total 0) so the report shape stays
 *  consistent across periods — never silently reshaped by which accounts happened to be used. */
export function buildIncomeStatement(records: FinanceRecord[], period: string): IncomeStatement {
  const scoped = records.filter(r => r.period === period);
  const pendapatanUsaha = group(scoped, 'pendapatan_usaha');
  const biayaProduksi = group(scoped, 'biaya_produksi');
  const biayaUsahaLain = group(scoped, 'biaya_usaha_lain');
  const totalBiayaAtasPendapatan = biayaProduksi.total + biayaUsahaLain.total;
  const labaKotor = pendapatanUsaha.total - totalBiayaAtasPendapatan;
  const biayaOperasional = group(scoped, 'biaya_operasional');
  const biayaNonOperasional = group(scoped, 'biaya_non_operasional');
  const totalPengeluaranOperasional = biayaOperasional.total + biayaNonOperasional.total;
  const labaOperasi = labaKotor - totalPengeluaranOperasional;
  const pendapatanLain = group(scoped, 'pendapatan_lain');
  const pengeluaranLain = group(scoped, 'pengeluaran_lain');
  const labaBersih = labaOperasi + pendapatanLain.total - pengeluaranLain.total;
  const unclassified = scoped.filter(r => !r.statementSection).map(r => ({ label: r.accountLabel?.trim() || r.category, amount: r.amount }));
  return { period, pendapatanUsaha, biayaProduksi, biayaUsahaLain, totalBiayaAtasPendapatan, labaKotor, biayaOperasional, biayaNonOperasional, totalPengeluaranOperasional, labaOperasi, pendapatanLain, pengeluaranLain, labaBersih, unclassified };
}
