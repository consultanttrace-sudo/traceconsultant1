/**
 * ============================================================================
 * ASET TETAP & PENYUSUTAN (FIXED ASSETS & DEPRECIATION)
 * ============================================================================
 * Peralatan dapur, mesin kopi, kulkas, interior — semua ini bernilai besar
 * di awal tapi nilainya turun seiring waktu. Tanpa modul ini, TRACE tidak
 * bisa: (1) menghitung Beban Penyusutan bulanan yang dibutuhkan Laba Rugi
 * & Arus Kas, atau (2) menunjukkan nilai buku aset yang tersisa di Neraca.
 *
 * Dipakai Metode Garis Lurus (Straight-Line) karena paling mudah dijelaskan
 * ke pemilik F&B yang bukan orang akuntansi, dan paling umum dipakai UMKM.
 */

export interface FixedAsset {
  id: string;
  clientId: string;
  name: string;
  acquisitionDate: string; // ISO date, kapan aset dibeli
  acquisitionCost: number; // harga perolehan
  usefulLifeMonths: number; // umur manfaat, dalam bulan (mis. 60 = 5 tahun)
  residualValue: number;    // estimasi nilai sisa di akhir umur manfaat (boleh 0)
}

export interface DepreciationScheduleRow {
  period: string; // "2026-09" dst.
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number; // harga perolehan − akumulasi penyusutan
}

export interface DepreciationSchedule {
  asset: FixedAsset;
  monthlyDepreciation: number;
  schedule: DepreciationScheduleRow[];
  fullyDepreciated: boolean;
}

/**
 * Formula: Penyusutan per bulan = (Harga Perolehan − Nilai Residu) / Umur Manfaat (bulan)
 * `periods` adalah daftar periode ("2026-01", "2026-02", ...) yang ingin dihitung —
 * biasanya dari bulan pembelian sampai bulan berjalan.
 */
export function buildDepreciationSchedule(asset: FixedAsset, periods: string[]): DepreciationSchedule {
  const depreciableBase = Math.max(0, asset.acquisitionCost - asset.residualValue);
  const monthlyDepreciation = asset.usefulLifeMonths > 0
    ? Math.round((depreciableBase / asset.usefulLifeMonths) * 100) / 100
    : 0;

  let accumulated = 0;
  const schedule: DepreciationScheduleRow[] = periods.map(period => {
    const remainingBase = depreciableBase - accumulated;
    const thisMonth = Math.min(monthlyDepreciation, Math.max(0, remainingBase));
    accumulated = Math.round((accumulated + thisMonth) * 100) / 100;
    return {
      period,
      monthlyDepreciation: thisMonth,
      accumulatedDepreciation: accumulated,
      bookValue: Math.round((asset.acquisitionCost - accumulated) * 100) / 100,
    };
  });

  return { asset, monthlyDepreciation, schedule, fullyDepreciated: accumulated >= depreciableBase - 0.5 };
}

/** Total beban penyusutan bulanan gabungan semua aset — dipakai langsung
 *  sebagai input `bebanPenyusutan` di cashFlowStatement.ts dan sebagai baris
 *  "Beban Penyusutan" di Laba Rugi. */
export function totalMonthlyDepreciation(assets: FixedAsset[]): number {
  const total = assets.reduce((sum, a) => {
    const base = Math.max(0, a.acquisitionCost - a.residualValue);
    const monthly = a.usefulLifeMonths > 0 ? base / a.usefulLifeMonths : 0;
    return sum + monthly;
  }, 0);
  return Math.round(total * 100) / 100;
}
