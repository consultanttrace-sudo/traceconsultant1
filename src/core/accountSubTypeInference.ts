/**
 * ============================================================================
 * INFERENSI SUB-TYPE AKUN DARI DATA YANG SUDAH ADA (TANPA MIGRATION)
 * ============================================================================
 * `chartOfAccounts.ts` mendefinisikan `AccountSubType` (aset_lancar, aset_tetap,
 * dst.) yang dibutuhkan `balanceSheet.ts` untuk menyusun Neraca. Tapi tabel
 * `trace_accounts` yang SUDAH ADA di Supabase (lihat
 * `supabase/migrations/028_accounting_and_cogs_v72.sql`) cuma punya kolom
 * `account_type` (asset/liability/equity/revenue/cogs/expense) — TIDAK ada
 * kolom untuk sub-type.
 *
 * Dua pilihan untuk menutup celah ini:
 *   (a) migration baru menambah kolom `sub_type` ke `trace_accounts`, atau
 *   (b) menebak sub-type dari data yang SUDAH ADA (kode akun + tipe akun),
 *       tanpa mengubah skema database sama sekali.
 *
 * File ini memilih (b) untuk sementara, karena:
 *   1. Project Supabase TRACE sedang berstatus INACTIVE (paused) saat file ini
 *      ditulis — tidak bisa diverifikasi/diuji migration terhadap skema live-nya.
 *      Menulis SQL migration tanpa bisa menjalankannya adalah tebakan, bukan
 *      kerja yang sudah diverifikasi.
 *   2. Akun standar yang dibuat lewat `defaultChartOfAccounts()` SELALU memakai
 *      pola kode 1100-6900 yang konsisten (lihat komentar di `chartOfAccounts.ts`),
 *      jadi sub-type-nya bisa ditebak dengan akurat dari kode akun tanpa perlu
 *      menyimpannya ulang di database.
 *   3. Kalau nanti project Supabase-nya aktif lagi dan tim MEMANG mau kolom
 *      `sub_type` eksplisit (mis. karena konsultan sering bikin akun custom di
 *      luar pola kode standar), migration (a) tetap bisa dibuat sebagai langkah
 *      terpisah — file ini tidak menghalangi itu, `AccountWithSubType` di
 *      `chartOfAccounts.ts` tetap struktur yang sama persis.
 *
 * PENTING: ini TEBAKAN berbasis pola kode, bukan sumber kebenaran. Kalau
 * konsultan membuat akun custom dengan kode di luar pola standar (mis. akun
 * aset dengan kode "9001"), fallback di bawah akan menebak berdasarkan
 * `account_type` saja (asset → aset_lancar, liability → liabilitas_lancar,
 * dst.) — cukup aman untuk kasus umum, tapi konsultan tetap perlu mengecek
 * manual kalau ada akun custom yang tidak mengikuti pola kode standar.
 */

import type { Account, AccountingAccountType } from './accounting.js';
import type { AccountSubType, AccountWithSubType } from './chartOfAccounts.js';

/** Fallback paling aman kalau kode akun tidak cocok pola manapun di bawah — dipilih
 *  supaya akun tetap MUNCUL di kelompok yang masuk akal, bukan hilang dari Neraca. */
const DEFAULT_SUBTYPE_BY_TYPE: Record<AccountingAccountType, AccountSubType> = {
  asset: 'aset_lancar',
  liability: 'liabilitas_lancar',
  equity: 'ekuitas',
  revenue: 'pendapatan_usaha',
  cogs: 'harga_pokok_penjualan',
  expense: 'beban_operasional',
};

/**
 * Menebak `AccountSubType` dari kode + tipe satu akun, mengikuti pola kode
 * yang sama persis dengan `defaultChartOfAccounts()`:
 *   1100-1499 aset lancar · 1500-1599 aset tetap
 *   2100-2499 liabilitas lancar · 2500-2999 liabilitas jangka panjang
 *   3xxx ekuitas · 4xxx pendapatan · 5xxx HPP · 6xxx beban
 */
export function inferAccountSubType(account: Pick<Account, 'code' | 'type'>): AccountSubType {
  const codeNum = Number.parseInt(account.code, 10);
  const hasNumericCode = Number.isFinite(codeNum);

  if (account.type === 'asset' && hasNumericCode) {
    if (codeNum >= 1500 && codeNum < 1600) return 'aset_tetap';
    if (codeNum >= 1100 && codeNum < 1500) return 'aset_lancar';
  }
  if (account.type === 'liability' && hasNumericCode) {
    if (codeNum >= 2500 && codeNum < 3000) return 'liabilitas_jangka_panjang';
    if (codeNum >= 2100 && codeNum < 2500) return 'liabilitas_lancar';
  }

  return DEFAULT_SUBTYPE_BY_TYPE[account.type];
}

/** Mengubah daftar `Account` polos (persis bentuk yang keluar dari
 *  `trace_read_client_dataset` RPC / kolom `accounts` di Supabase) menjadi
 *  `AccountWithSubType[]` yang siap dipakai `buildBalanceSheet()` — tanpa
 *  butuh kolom `sub_type` apa pun di database. */
export function withInferredSubTypes(accounts: Account[]): AccountWithSubType[] {
  return accounts.map(a => ({ ...a, subType: inferAccountSubType(a) }));
}
