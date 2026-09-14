/**
 * ============================================================================
 * NERACA (BALANCE SHEET)
 * ============================================================================
 * Ini modul yang paling penting yang sebelumnya belum ada di TRACE.
 * Tanpa Neraca, TRACE baru bisa menjawab "apakah bisnis untung bulan ini"
 * (lewat Laba Rugi), tapi TIDAK bisa menjawab "berapa total kekayaan bisnis
 * ini sekarang, dan dari mana sumbernya (utang atau modal sendiri)".
 *
 * Prinsip dasar Neraca yang tidak boleh dilanggar:
 *     TOTAL ASET  =  TOTAL LIABILITAS  +  TOTAL EKUITAS
 * Kalau angka ini tidak sama (`balanced: false`), itu tanda pasti ada
 * kesalahan input jurnal yang HARUS dicek sebelum laporan dikirim ke klien —
 * bukan sekadar selisih pembulatan yang boleh diabaikan.
 */

import type { AccountingBalance, TrialBalance } from './accounting.js';
import { normalBalanceOf } from './chartOfAccounts.js';
import type { AccountSubType, AccountWithSubType } from './chartOfAccounts.js';

export interface BalanceSheetLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: number;
}

export interface BalanceSheetGroup {
  subType: AccountSubType;
  label: string;
  lines: BalanceSheetLine[];
  total: number;
}

export interface BalanceSheet {
  asOfPeriod: string;
  asetLancar: BalanceSheetGroup;
  asetTetap: BalanceSheetGroup;
  totalAset: number;
  liabilitasLancar: BalanceSheetGroup;
  liabilitasJangkaPanjang: BalanceSheetGroup;
  totalLiabilitas: number;
  ekuitas: BalanceSheetGroup;
  /** Laba/rugi bersih periode berjalan (dari Income Statement), yang secara
   *  akuntansi ikut menambah Ekuitas SELAMA buku belum ditutup (lihat periodClose.ts).
   *  Kalau ini `null`, berarti Laba Rugi periode ini belum dihitung — Neraca
   *  tidak dipaksa "balanced" secara palsu dengan menganggapnya 0. */
  labaBerjalan: number | null;
  totalEkuitas: number;
  totalLiabilitasDanEkuitas: number;
  /** true hanya kalau Total Aset benar-benar sama dengan Total Liabilitas + Ekuitas,
   *  DAN tidak ada akun yang datanya hilang dari Trial Balance. */
  balanced: boolean;
  /** Selisih Total Aset dikurangi (Total Liabilitas + Ekuitas). Harusnya 0.
   *  Kalau tidak 0, ini bukti konkret ada jurnal yang salah/tidak seimbang. */
  selisih: number;
  missingAccountIds: string[];
}

const GROUP_LABEL: Record<AccountSubType, string> = {
  aset_lancar: 'Aset Lancar',
  aset_tetap: 'Aset Tetap',
  liabilitas_lancar: 'Liabilitas Jangka Pendek',
  liabilitas_jangka_panjang: 'Liabilitas Jangka Panjang',
  ekuitas: 'Ekuitas',
  pendapatan_usaha: 'Pendapatan Usaha',
  harga_pokok_penjualan: 'Harga Pokok Penjualan',
  beban_operasional: 'Beban Operasional',
};

function buildGroup(
  subType: AccountSubType,
  accounts: AccountWithSubType[],
  balances: Map<string, AccountingBalance>,
): BalanceSheetGroup {
  const lines: BalanceSheetLine[] = accounts
    .filter(a => a.subType === subType)
    .map(a => {
      const b = balances.get(a.id);
      const stored = b ? b.balance : 0; // accounting.ts selalu menyimpan saldo sebagai (debit − credit)
      // Untuk akun yang saldo normalnya KREDIT (Liabilitas, Ekuitas), (debit − credit) akan
      // tampil dengan tanda TERBALIK dari yang seharusnya dilaporkan (mis. Modal Rp10jt yang
      // dicatat lewat kredit akan tersimpan sebagai -10.000.000). Baris ini membalik tandanya
      // supaya Neraca menampilkan angka yang benar — tanpa ini, Total Aset TIDAK PERNAH akan
      // sama dengan Total Liabilitas + Ekuitas walaupun jurnalnya sendiri sudah seimbang.
      const raw = normalBalanceOf(a.type) === 'credit' ? -stored : stored;
      // Akun kontra-aset (mis. "Akumulasi Penyusutan") tetap bertipe 'asset' (saldo normal debit
      // menurut normalBalanceOf), padahal secara praktik selalu bertambah lewat sisi kredit dan
      // harus tampil sebagai PENGURANG di kelompok Aset, bukan dijumlah biasa seperti aset lain.
      const isContraAsset = a.type === 'asset' && a.name.toLowerCase().includes('akumulasi penyusutan');
      return {
        accountId: a.id,
        accountCode: a.code,
        accountName: a.name,
        balance: isContraAsset ? -Math.abs(raw) : raw,
      };
    })
    .filter(line => line.balance !== 0); // akun yang belum pernah dipakai tidak perlu memenuhi laporan

  return { subType, label: GROUP_LABEL[subType], lines, total: lines.reduce((s, l) => s + l.balance, 0) };
}

export function buildBalanceSheet(
  accounts: AccountWithSubType[],
  trialBalance: TrialBalance,
  asOfPeriod: string,
  labaBerjalanSaatIni: number | null,
): BalanceSheet {
  const balances = new Map(trialBalance.accounts.map(b => [b.accountId, b]));

  const asetLancar = buildGroup('aset_lancar', accounts, balances);
  const asetTetap = buildGroup('aset_tetap', accounts, balances);
  const totalAset = asetLancar.total + asetTetap.total;

  const liabilitasLancar = buildGroup('liabilitas_lancar', accounts, balances);
  const liabilitasJangkaPanjang = buildGroup('liabilitas_jangka_panjang', accounts, balances);
  const totalLiabilitas = liabilitasLancar.total + liabilitasJangkaPanjang.total;

  const ekuitas = buildGroup('ekuitas', accounts, balances);
  const totalEkuitas = ekuitas.total + (labaBerjalanSaatIni ?? 0);

  const totalLiabilitasDanEkuitas = totalLiabilitas + totalEkuitas;
  const selisih = Math.round((totalAset - totalLiabilitasDanEkuitas) * 100) / 100;

  return {
    asOfPeriod,
    asetLancar,
    asetTetap,
    totalAset,
    liabilitasLancar,
    liabilitasJangkaPanjang,
    totalLiabilitas,
    ekuitas,
    labaBerjalan: labaBerjalanSaatIni,
    totalEkuitas,
    totalLiabilitasDanEkuitas,
    balanced: Math.abs(selisih) < 0.5 && trialBalance.missingAccountIds.length === 0,
    selisih,
    missingAccountIds: trialBalance.missingAccountIds,
  };
}
