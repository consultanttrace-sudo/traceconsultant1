/**
 * ============================================================================
 * LAPORAN ARUS KAS (CASH FLOW STATEMENT) — Metode Tidak Langsung
 * ============================================================================
 * Ini laporan yang paling sering dibutuhkan pemilik F&B tapi paling jarang
 * ada di tool internal buatan sendiri, karena orang sering mengira
 * "Laba Rugi positif = kas aman". Padahal keduanya bisa sangat berbeda:
 * restoran bisa untung di atas kertas tapi kehabisan kas kalau piutang
 * menumpuk atau baru beli banyak stok/peralatan.
 *
 * Kenapa Metode Tidak Langsung (bukan mencatat ulang tiap transaksi kas)?
 * Karena bisa disusun dari Neraca 2 periode + Laba Rugi yang SUDAH ADA di
 * TRACE — konsultan tidak perlu proses pencatatan tambahan yang berat.
 *
 * Formula inti:
 *   Kas dari Operasional
 *     = Laba Bersih
 *     + Beban Penyusutan            (biaya non-kas, uangnya tidak benar-benar keluar)
 *     − Kenaikan Piutang Usaha      (sudah diakui sbg pendapatan, uang belum masuk)
 *     − Kenaikan Persediaan         (uang sudah keluar beli stok, belum jadi HPP)
 *     + Kenaikan Utang Usaha        (biaya sudah diakui, uang belum keluar)
 *
 *   Kas dari Investasi = − (pembelian aset tetap bersih)
 *   Kas dari Pendanaan = kenaikan utang bank + setoran modal − prive
 *
 * PENTING soal kejujuran data: kalau salah satu input tidak tersedia,
 * fungsi ini TETAP menghitung total dengan asumsi 0 untuk baris itu (supaya
 * laporan tetap bisa ditampilkan), TAPI nama baris yang datanya kosong selalu
 * dicatat di `missingInputs`. UI wajib menampilkan peringatan kalau
 * `missingInputs.length > 0` — jangan pernah menampilkan angka total seolah
 * sudah final kalau ada input yang sebenarnya belum lengkap.
 */

export interface CashFlowLine { label: string; amount: number; }
export interface CashFlowSection { title: string; lines: CashFlowLine[]; total: number; }

export interface CashFlowStatement {
  period: string;
  operasional: CashFlowSection;
  investasi: CashFlowSection;
  pendanaan: CashFlowSection;
  kenaikanKasBersih: number;
  kasAwalPeriode: number | null;
  kasAkhirPeriode: number | null;
  missingInputs: string[];
}

export interface CashFlowInput {
  period: string;
  labaBersih: number | null;
  bebanPenyusutan: number | null;
  perubahanPiutangUsaha: number | null;     // (+) kalau piutang naik dibanding periode lalu
  perubahanPersediaan: number | null;       // (+) kalau persediaan naik
  perubahanUtangUsaha: number | null;       // (+) kalau utang usaha naik
  perubahanAsetTetapKotor: number | null;   // (+) kalau ada pembelian aset tetap baru (netto)
  perubahanUtangBank: number | null;
  perubahanModal: number | null;
  prive: number | null;
  kasAwalPeriode: number | null;
}

export function buildCashFlowStatement(input: CashFlowInput): CashFlowStatement {
  const missing: string[] = [];
  const need = (label: string, v: number | null): number => {
    if (v === null || !Number.isFinite(v)) { missing.push(label); return 0; }
    return v;
  };

  const labaBersih = need('Laba Bersih', input.labaBersih);
  const penyusutan = need('Beban Penyusutan', input.bebanPenyusutan);
  const dPiutang = need('Perubahan Piutang Usaha', input.perubahanPiutangUsaha);
  const dPersediaan = need('Perubahan Persediaan', input.perubahanPersediaan);
  const dUtangUsaha = need('Perubahan Utang Usaha', input.perubahanUtangUsaha);

  const operasional: CashFlowSection = {
    title: 'Arus Kas dari Aktivitas Operasional',
    lines: [
      { label: 'Laba Bersih', amount: labaBersih },
      { label: 'Beban Penyusutan (non-kas)', amount: penyusutan },
      { label: 'Perubahan Piutang Usaha', amount: -dPiutang },
      { label: 'Perubahan Persediaan', amount: -dPersediaan },
      { label: 'Perubahan Utang Usaha', amount: dUtangUsaha },
    ],
    total: labaBersih + penyusutan - dPiutang - dPersediaan + dUtangUsaha,
  };

  const dAsetTetap = need('Perubahan Aset Tetap', input.perubahanAsetTetapKotor);
  const investasi: CashFlowSection = {
    title: 'Arus Kas dari Aktivitas Investasi',
    lines: [{ label: 'Pembelian Aset Tetap (bersih)', amount: -dAsetTetap }],
    total: -dAsetTetap,
  };

  const dUtangBank = need('Perubahan Utang Bank', input.perubahanUtangBank);
  const dModal = need('Perubahan Modal', input.perubahanModal);
  const prive = need('Prive / Penarikan Pemilik', input.prive);
  const pendanaan: CashFlowSection = {
    title: 'Arus Kas dari Aktivitas Pendanaan',
    lines: [
      { label: 'Perubahan Utang Bank', amount: dUtangBank },
      { label: 'Setoran Modal', amount: dModal },
      { label: 'Prive / Penarikan Pemilik', amount: -prive },
    ],
    total: dUtangBank + dModal - prive,
  };

  const kenaikanKasBersih = operasional.total + investasi.total + pendanaan.total;
  const kasAwalPeriode = input.kasAwalPeriode;
  const kasAkhirPeriode = kasAwalPeriode !== null ? kasAwalPeriode + kenaikanKasBersih : null;
  if (kasAwalPeriode === null) missing.push('Kas Awal Periode');

  return { period: input.period, operasional, investasi, pendanaan, kenaikanKasBersih, kasAwalPeriode, kasAkhirPeriode, missingInputs: missing };
}
