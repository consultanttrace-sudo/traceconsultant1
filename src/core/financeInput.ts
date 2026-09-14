import type { FinanceRecord } from './finance.js';

export type FinanceInputIssue = {
  field: keyof FinanceRecord | 'evidence';
  severity: 'error' | 'warning';
  code: string;
  message: string;
  suggestion: string;
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateFinanceRecord(input: Partial<FinanceRecord>): FinanceInputIssue[] {
  const issues: FinanceInputIssue[] = [];
  if (!input.id?.trim()) issues.push({field:'id', severity:'error', code:'MISSING_ID', message:'ID transaksi belum diisi.', suggestion:'Gunakan ID unik untuk setiap catatan.'});
  if (!input.period || !PERIOD_RE.test(input.period)) issues.push({field:'period', severity:'error', code:'INVALID_PERIOD', message:'Periode harus berformat YYYY-MM.', suggestion:'Contoh: 2026-08.'});
  if (!input.category || !['revenue','cogs','labor','opex'].includes(input.category)) issues.push({field:'category', severity:'error', code:'INVALID_CATEGORY', message:'Kategori keuangan belum valid.', suggestion:'Pilih Revenue, COGS, Labor, atau OPEX.'});
  if (input.amount === undefined || !Number.isFinite(input.amount)) issues.push({field:'amount', severity:'error', code:'INVALID_AMOUNT', message:'Nominal belum diisi dengan angka yang valid.', suggestion:'Masukkan angka tanpa simbol mata uang.'});
  else if (input.amount < 0) issues.push({field:'amount', severity:'error', code:'NEGATIVE_AMOUNT', message:'Nominal negatif terdeteksi.', suggestion:'Periksa apakah ini memang transaksi pembalik. Jika iya, catat sebagai adjustment dengan sumber yang jelas.'});
  if (input.evidence?.source === 'manual' && !input.evidence.note?.trim()) issues.push({field:'evidence', severity:'warning', code:'MANUAL_WITHOUT_NOTE', message:'Data manual belum memiliki catatan sumber.', suggestion:'Tambahkan sumber atau catatan agar angka dapat diaudit.'});
  return issues;
}

export function financeInputGuidance(issues: FinanceInputIssue[]) {
  if (!issues.length) return { status: 'ready' as const, title: 'Data siap diperiksa', message: 'Tidak ada kesalahan format pada input ini.' };
  const errors = issues.filter(i => i.severity === 'error').length;
  return errors ? { status: 'blocked' as const, title: 'Periksa input sebelum disimpan', message: `${errors} kesalahan perlu diperbaiki. TRACE tidak akan menganggap data ini valid sebelum diperbaiki.` } : { status: 'review' as const, title: 'Input dapat disimpan dengan catatan', message: 'Ada informasi yang sebaiknya dilengkapi agar analisis lebih dapat dipertanggungjawabkan.' };
}
