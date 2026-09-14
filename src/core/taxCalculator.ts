/**
 * ============================================================================
 * KALKULATOR PAJAK SEDERHANA — PPN & PPh Final UMKM
 * ============================================================================
 * BATASAN TANGGUNG JAWAB (harap ditampilkan juga di UI, bukan cuma di kode):
 * Modul ini HANYA untuk ESTIMASI INTERNAL memakai tarif publik yang berlaku
 * umum saat file ini ditulis (PPN 11%, PPh Final UMKM 0,5%). Modul ini:
 *   - BUKAN pengganti akuntan/konsultan pajak resmi
 *   - BUKAN alat pelaporan SPT ke DJP
 *   - TIDAK memperhitungkan status PKP, jenis usaha, atau skema pajak khusus
 *     yang mungkin berlaku untuk klien tertentu
 *   - Tarif pajak bisa berubah kapan saja — SELALU verifikasi ke peraturan
 *     terbaru dan akuntan klien sebelum angka ini dipakai untuk keputusan
 *     atau pelaporan resmi.
 */

export interface PpnResult { dpp: number; tarifPersen: number; ppn: number; totalTermasukPpn: number; }

/** DPP = Dasar Pengenaan Pajak (harga SEBELUM PPN). */
export function calculatePpn(dpp: number, tarifPersen: number = 11): PpnResult {
  const ppn = Math.round(dpp * (tarifPersen / 100));
  return { dpp, tarifPersen, ppn, totalTermasukPpn: dpp + ppn };
}

/** Kebalikannya: harga yang diinput SUDAH termasuk PPN, cari mundur DPP-nya.
 *  Berguna kalau yang tercatat di kasir/POS adalah harga jual final ke pembeli. */
export function extractPpnFromGrossPrice(hargaTermasukPpn: number, tarifPersen: number = 11): PpnResult {
  const dpp = Math.round(hargaTermasukPpn / (1 + tarifPersen / 100));
  return { dpp, tarifPersen, ppn: hargaTermasukPpn - dpp, totalTermasukPpn: hargaTermasukPpn };
}

export interface PphFinalUmkmResult { omsetBulanan: number; tarifPersen: number; pphTerutang: number; }

/** PPh Final UMKM: 0,5% dari omset bulanan (bukan dari laba), untuk usaha dengan
 *  kriteria omset tertentu per tahun dan berlaku untuk jangka waktu terbatas
 *  sejak usaha terdaftar. Kelayakan tiap klien HARUS dicek dengan akuntan —
 *  fungsi ini tidak memvalidasi kelayakan tersebut. */
export function calculatePphFinalUmkm(omsetBulanan: number, tarifPersen: number = 0.5): PphFinalUmkmResult {
  return { omsetBulanan, tarifPersen, pphTerutang: Math.round(omsetBulanan * (tarifPersen / 100)) };
}

export interface TaxSummary {
  period: string;
  ppnKeluaran: number; // PPN dari penjualan ke pembeli
  ppnMasukan: number;  // PPN yang sudah dibayar ke supplier ber-PKP
  ppnKurangBayar: number;
  pphFinal: number;
  totalKewajibanPajak: number;
}

/** Rekap pajak bulanan sederhana: PPN Kurang Bayar = Keluaran − Masukan (tidak boleh negatif,
 *  kalau negatif artinya ada kelebihan bayar yang perlu dikonfirmasi ke akuntan, bukan dianggap 0 diam-diam). */
export function summarizeMonthlyTax(period: string, ppnKeluaran: number, ppnMasukan: number, pphFinal: number): TaxSummary {
  const ppnKurangBayar = Math.max(0, Math.round((ppnKeluaran - ppnMasukan) * 100) / 100);
  return { period, ppnKeluaran, ppnMasukan, ppnKurangBayar, pphFinal, totalKewajibanPajak: ppnKurangBayar + pphFinal };
}
