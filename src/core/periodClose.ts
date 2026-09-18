/**
 * ============================================================================
 * TUTUP BUKU (PERIOD CLOSE)
 * ============================================================================
 * Dua masalah nyata yang ditutup modul ini:
 *
 * 1. TANPA period lock, siapa pun bisa mengubah jurnal bulan lalu setelah
 *    laporan sudah dikirim ke klien — angka yang klien lihat bulan lalu
 *    diam-diam berbeda dari yang tersimpan sekarang. `assertPeriodNotLocked`
 *    mencegah ini dengan melempar error sebelum jurnal baru diposting ke
 *    periode yang sudah ditutup.
 *
 * 2. TANPA jurnal penutup, saldo akun Pendapatan/HPP/Beban akan terus
 *    menumpuk dari bulan ke bulan alih-alih mulai dari nol tiap periode baru
 *    — ini bikin Trial Balance & Neraca salah untuk periode berikutnya.
 *    `buildClosingEntry` meniru siklus akuntansi manual: memindahkan laba
 *    bersih periode itu ke akun "Laba Ditahan", lalu me-reset akun nominal
 *    (Pendapatan/HPP/Beban) ke nol.
 */

import type { JournalEntry, JournalLine } from './accounting.js';

export interface PeriodLock {
  period: string;   // "2026-08"
  clientId: string;
  lockedAt: string;
  lockedBy: string;
}

export function isPeriodLocked(period: string, clientId: string, locks: PeriodLock[]): boolean {
  return locks.some(l => l.period === period && l.clientId === clientId);
}

/** Dipanggil sebelum memposting jurnal baru manapun. Melempar error kalau periode terkunci. */
export function assertPeriodNotLocked(period: string, clientId: string, locks: PeriodLock[]): void {
  if (isPeriodLocked(period, clientId, locks)) {
    throw new Error(
      `Periode ${period} untuk klien ini sudah ditutup (locked). ` +
      `Tidak bisa memposting jurnal baru ke periode yang laporannya sudah selesai dikirim. ` +
      `Kalau memang perlu koreksi, buat jurnal penyesuaian di periode berjalan, jangan buka kunci periode lama.`,
    );
  }
}

export interface ClosingEntryParams {
  clientId: string;
  period: string;
  labaBersih: number;                  // hasil akhir Income Statement periode ini
  retainedEarningsAccountId: string;   // id akun "Laba Ditahan"
  /** Saldo tiap akun Pendapatan/HPP/Beban pada periode ini (dari Trial Balance),
   *  yang akan direset ke nol lewat jurnal penutup. */
  nominalAccountBalances: Array<{ accountId: string; balance: number }>;
  entryId: string;
  entryDate: string;
}

export interface ClosingEntryResult {
  closingEntry: JournalEntry;
  labaBersihDipindahkan: number;
}

export function buildClosingEntry(params: ClosingEntryParams): ClosingEntryResult {
  const lines: JournalLine[] = params.nominalAccountBalances.map(a => ({
    accountId: a.accountId,
    // Membalik saldo akun nominal ke nol: akun bersaldo kredit (Pendapatan) didebit,
    // akun bersaldo debit (HPP/Beban) dikredit.
    debit: a.balance < 0 ? Math.abs(a.balance) : 0,
    credit: a.balance > 0 ? a.balance : 0,
    memo: 'Jurnal penutup — reset akun nominal ke nol',
  }));

  lines.push({
    accountId: params.retainedEarningsAccountId,
    debit: params.labaBersih < 0 ? Math.abs(params.labaBersih) : 0,
    credit: params.labaBersih > 0 ? params.labaBersih : 0,
    memo: 'Pemindahan laba/rugi bersih periode ke Laba Ditahan',
  });

  return {
    closingEntry: {
      id: params.entryId,
      clientId: params.clientId,
      date: params.entryDate,
      memo: `Jurnal Penutup — Periode ${params.period}`,
      source: 'adjustment',
      lines,
    },
    labaBersihDipindahkan: params.labaBersih,
  };
}
