/**
 * ============================================================================
 * CHART OF ACCOUNTS (DAFTAR AKUN) — pelengkap accounting.ts
 * ============================================================================
 * accounting.ts yang sudah ada hanya punya 6 tipe akun besar (asset, liability,
 * equity, revenue, cogs, expense). Itu cukup untuk trial balance, tapi TIDAK
 * cukup untuk menyusun Neraca yang benar, karena Neraca butuh tahu:
 *   - Aset mana yang "Lancar" (cair < 1 tahun) vs "Tetap" (dipakai lama)
 *   - Liabilitas mana yang jatuh tempo < 1 tahun vs jangka panjang
 *
 * File ini TIDAK mengubah accounting.ts sama sekali (tidak ada breaking change).
 * Ia hanya menambah lapisan `subType` di atas tipe `Account` yang sudah ada,
 * plus daftar akun standar siap pakai untuk klien F&B baru.
 */

import type { Account, AccountingAccountType } from './accounting.js';

/** Sub-kategori akun, dipakai untuk menyusun Neraca & Arus Kas dengan benar. */
export type AccountSubType =
  | 'aset_lancar'                  // Kas, Bank, Piutang, Persediaan — cair < 1 tahun
  | 'aset_tetap'                   // Peralatan dapur, renovasi, kendaraan — dipakai > 1 tahun
  | 'liabilitas_lancar'            // Utang usaha, utang gaji, utang pajak — jatuh tempo < 1 tahun
  | 'liabilitas_jangka_panjang'    // Utang bank jangka panjang, leasing
  | 'ekuitas'
  | 'pendapatan_usaha'
  | 'harga_pokok_penjualan'
  | 'beban_operasional';

export type NormalBalance = 'debit' | 'credit';

/**
 * Setiap jenis akun punya "sisi wajar" untuk bertambah: debit atau kredit.
 * Ini dipakai untuk mendeteksi input yang aneh (mis. akun Kas tiba-tiba
 * bersaldo kredit besar → kemungkinan salah input, bukan kondisi normal).
 */
export function normalBalanceOf(type: AccountingAccountType): NormalBalance {
  switch (type) {
    case 'asset':
    case 'cogs':
    case 'expense':
      return 'debit';
    case 'liability':
    case 'equity':
    case 'revenue':
      return 'credit';
  }
}

export interface AccountWithSubType extends Account {
  subType: AccountSubType;
}

/**
 * Daftar akun standar untuk klien F&B baru (cafe/restoran menengah).
 * Ini TITIK AWAL, bukan daftar yang mengikat — konsultan tetap bisa
 * menambah/menonaktifkan akun sesuai kebutuhan spesifik tiap klien.
 *
 * Pola kode akun mengikuti konvensi umum Indonesia:
 *   1xxx Aset · 2xxx Liabilitas · 3xxx Ekuitas
 *   4xxx Pendapatan · 5xxx HPP · 6xxx Beban Operasional
 */
export function defaultChartOfAccounts(clientId: string): AccountWithSubType[] {
  const row = (
    code: string,
    name: string,
    type: AccountingAccountType,
    subType: AccountSubType,
  ): AccountWithSubType => ({ id: `${clientId}-${code}`, clientId, code, name, type, active: true, subType });

  return [
    // ── ASET LANCAR ──────────────────────────────────────────────────────
    row('1100', 'Kas', 'asset', 'aset_lancar'),
    row('1110', 'Bank', 'asset', 'aset_lancar'),
    row('1200', 'Piutang Usaha', 'asset', 'aset_lancar'),
    row('1300', 'Persediaan Bahan Baku', 'asset', 'aset_lancar'),
    row('1310', 'Persediaan Barang Jadi', 'asset', 'aset_lancar'),
    row('1400', 'Pajak Dibayar Dimuka (PPN Masukan)', 'asset', 'aset_lancar'),
    // ── ASET TETAP ───────────────────────────────────────────────────────
    row('1500', 'Peralatan Dapur & Kasir', 'asset', 'aset_tetap'),
    row('1510', 'Renovasi & Interior', 'asset', 'aset_tetap'),
    row('1590', 'Akumulasi Penyusutan', 'asset', 'aset_tetap'), // saldo normalnya kredit (kontra-aset)
    // ── LIABILITAS LANCAR ────────────────────────────────────────────────
    row('2100', 'Utang Usaha (Supplier)', 'liability', 'liabilitas_lancar'),
    row('2200', 'Utang Gaji', 'liability', 'liabilitas_lancar'),
    row('2300', 'Utang Pajak (PPN Keluaran & PPh)', 'liability', 'liabilitas_lancar'),
    // ── LIABILITAS JANGKA PANJANG ────────────────────────────────────────
    row('2500', 'Utang Bank Jangka Panjang', 'liability', 'liabilitas_jangka_panjang'),
    // ── EKUITAS ──────────────────────────────────────────────────────────
    row('3100', 'Modal Pemilik', 'equity', 'ekuitas'),
    row('3200', 'Prive / Penarikan Pemilik', 'equity', 'ekuitas'),
    row('3900', 'Laba Ditahan', 'equity', 'ekuitas'),
    // ── PENDAPATAN ───────────────────────────────────────────────────────
    row('4100', 'Penjualan Makanan', 'revenue', 'pendapatan_usaha'),
    row('4200', 'Penjualan Minuman', 'revenue', 'pendapatan_usaha'),
    row('4900', 'Pendapatan Lain-lain', 'revenue', 'pendapatan_usaha'),
    // ── HARGA POKOK PENJUALAN ────────────────────────────────────────────
    row('5100', 'HPP Bahan Baku Makanan', 'cogs', 'harga_pokok_penjualan'),
    row('5200', 'HPP Bahan Baku Minuman', 'cogs', 'harga_pokok_penjualan'),
    row('5300', 'HPP Kemasan', 'cogs', 'harga_pokok_penjualan'),
    // ── BEBAN OPERASIONAL ────────────────────────────────────────────────
    row('6100', 'Beban Gaji & Tunjangan', 'expense', 'beban_operasional'),
    row('6200', 'Beban Sewa Tempat', 'expense', 'beban_operasional'),
    row('6300', 'Beban Listrik, Air & Internet', 'expense', 'beban_operasional'),
    row('6400', 'Beban Marketing & Promosi', 'expense', 'beban_operasional'),
    row('6500', 'Beban Penyusutan', 'expense', 'beban_operasional'),
    row('6900', 'Beban Lain-lain', 'expense', 'beban_operasional'),
  ];
}
