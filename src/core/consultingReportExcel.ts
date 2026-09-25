import type { ConsultingReport } from './reporting.js';

/**
 * Builds and downloads a proper multi-sheet .xlsx for a ConsultingReport: Ringkasan,
 * Finance, KPI, Evidence & Limitations. This is a browser-only sibling of reporting.ts
 * (which stays Node-safe for tests_core/reporting.mjs) — same split as financeReport.ts
 * vs finance.ts. Uses the `xlsx` (SheetJS) package already used by exportFinanceExcel,
 * so no new dependency and no native/editable-chart claim (plain data sheets only).
 */
export async function exportConsultingReportExcel(report: ConsultingReport): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const na = 'Belum tersedia';

  const ringkasanRows: Array<Array<string | number>> = [
    ['TRACE CONSULTANTS — Laporan Konsultasi'],
    ['Judul', report.title],
    ['Klien', report.clientName],
    ['Periode', report.periods.current + (report.periods.previous ? ` (vs ${report.periods.previous})` : ' (tanpa periode pembanding)')],
    ['Dibuat', report.generatedAt],
    [],
    ['Ringkasan Eksekutif'],
    [report.executiveSummary],
    [],
    ['Kesimpulan Diagnosis'],
    [report.diagnosis.conclusion],
    [],
    ['Limitations'],
    ...(report.limitations.length ? report.limitations.map(l => [l]) : [['Tidak ada limitation yang dicatat.']]),
  ];
  const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows);
  wsRingkasan['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');

  const financeRows = [
    ['Metrik', 'Current', 'Previous', 'Change', 'Change %', 'Status', 'Formula'],
    ...report.finance.metrics.map(m => [
      m.metric, m.current ?? na, m.previous ?? na, m.change ?? na,
      m.changePct === null ? na : Number(m.changePct.toFixed(2)),
      m.status === 'calculated' ? 'Terhitung' : m.status === 'insufficient_data' ? 'Data belum cukup' : 'Baseline tidak terdefinisi',
      m.formula,
    ]),
  ];
  const wsFinance = XLSX.utils.aoa_to_sheet(financeRows);
  wsFinance['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsFinance, 'Finance');

  const kpiRows = [
    ['Indikator', 'Current', 'Previous', 'Change', 'Change %', 'Target Gap', 'Status', 'Kesimpulan'],
    ...(report.kpis.length
      ? report.kpis.map(k => [
          k.name, k.current ?? na, k.previous ?? na, k.change ?? na,
          k.changePct === null ? na : Number(k.changePct.toFixed(2)),
          k.targetGap ?? na, k.status, k.conclusion,
        ])
      : [['Tidak ada KPI organization-level tersimpan untuk periode ini.', '', '', '', '', '', '', '']]),
  ];
  const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpi['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsKpi, 'KPI');

  const evidenceRows = [
    ['Source', 'Period', 'Detail'],
    ...(report.evidence.length ? report.evidence.map(e => [e.source, e.period ?? '', e.detail]) : [['—', '', 'Tidak ada evidence tambahan yang dicatat.']]),
  ];
  const wsEvidence = XLSX.utils.aoa_to_sheet(evidenceRows);
  wsEvidence['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsEvidence, 'Evidence');

  const fileScope = report.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  XLSX.writeFile(wb, `trace-laporan-konsultasi-${fileScope}-${report.periods.current}.xlsx`);
}
