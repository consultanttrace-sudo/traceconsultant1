import type { FinanceRecord, FinanceSummary, FinanceComparison } from './finance.js';
import type { IncomeStatement, StatementGroup } from './financeStatement.js';
import { computePieSlices, renderPieChartPng } from './chartRender.js';

export interface FinanceReportMeta {
  clientName: string;
  currentPeriod: string;
  previousPeriod?: string;
  generatedAt?: string;
}

const CATEGORY_LABEL: Record<FinanceRecord['category'], string> = {
  revenue: 'Revenue', cogs: 'COGS', labor: 'Labor', opex: 'OPEX',
};

function fmtRp(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'Belum tersedia';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'Belum tersedia';
  return n.toFixed(1) + '%';
}
function summaryRows(summary: FinanceSummary) {
  return [
    ['Revenue', fmtRp(summary.revenue)],
    ['COGS', fmtRp(summary.cogs)],
    ['Gross Profit', fmtRp(summary.grossProfit)],
    ['Gross Margin %', fmtPct(summary.grossMarginPct)],
    ['Labor', fmtRp(summary.labor)],
    ['OPEX', fmtRp(summary.opex)],
    ['Operating Profit', fmtRp(summary.operatingProfit)],
    ['Operating Margin %', fmtPct(summary.operatingMarginPct)],
  ];
}

/** Builds and downloads a multi-sheet .xlsx: Ringkasan, Perbandingan Periode, Detail Transaksi. */
export async function exportFinanceExcel(
  records: FinanceRecord[],
  comparison: FinanceComparison,
  meta: FinanceReportMeta,
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const summarySheetRows = [
    ['TRACE CONSULTANTS — Laporan Keuangan'],
    ['Klien', meta.clientName],
    ['Periode', meta.currentPeriod + (meta.previousPeriod ? ` (vs ${meta.previousPeriod})` : '')],
    ['Dibuat', meta.generatedAt ?? new Date().toISOString()],
    [],
    ['Metrik', 'Nilai'],
    ...summaryRows(comparison.current),
    [],
    ['Catatan', 'Metrik yang datanya belum lengkap ditandai "Belum tersedia", bukan dianggap 0, agar tidak menyesatkan analisis.'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetRows);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  const comparisonRows = [
    ['Metrik', `Periode ${meta.currentPeriod}`, meta.previousPeriod ? `Periode ${meta.previousPeriod}` : 'Periode sebelumnya', 'Perubahan', 'Perubahan %', 'Status', 'Formula'],
    ...comparison.metrics.map(m => [
      m.metric, m.current ?? 'Belum tersedia', m.previous ?? 'Belum tersedia',
      m.change ?? 'Belum tersedia', m.changePct === null ? 'Belum tersedia' : Number(m.changePct.toFixed(2)),
      m.status === 'calculated' ? 'Terhitung' : m.status === 'insufficient_data' ? 'Data belum cukup' : 'Baseline tidak terdefinisi (periode lalu = 0)',
      m.formula,
    ]),
  ];
  const wsComparison = XLSX.utils.aoa_to_sheet(comparisonRows);
  wsComparison['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsComparison, 'Perbandingan Periode');

  const detailRows = [
    ['Periode', 'Kategori', 'Nominal', 'Sumber Evidence', 'Catatan', 'Dibuat'],
    ...records
      .filter(r => r.period === meta.currentPeriod || r.period === meta.previousPeriod)
      .sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category))
      .map(r => [r.period, CATEGORY_LABEL[r.category], r.amount, r.evidence?.source ?? '—', r.evidence?.note ?? '', r.evidence?.capturedAt ?? '']),
  ];
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Transaksi');

  const fileScope = meta.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  XLSX.writeFile(wb, `trace-consultant-${fileScope}-${meta.currentPeriod}.xlsx`);
}

/**
 * Builds and downloads a .xlsx with a "Dashboard" sheet that includes a chart image
 * (pie: distribusi COGS/Labor/OPEX untuk periode berjalan), plus a raw-data sheet.
 * Uses `exceljs`, NOT `xlsx` — the `xlsx` package's own README lists "images/graphs" as a
 * SheetJS Pro-only feature, so it cannot embed pictures when writing. exceljs's addImage is a
 * real, documented open-source feature (see node_modules/exceljs/README.md "Images" section),
 * verified before this function was written, not assumed.
 * The chart is a static PNG, not a native/editable Excel chart object — opening the file in Excel
 * shows a picture, not something you can right-click "Edit Data" on.
 */
export async function exportFinanceDashboardExcel(
  records: FinanceRecord[],
  meta: FinanceReportMeta,
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TRACE Consultant OS';
  wb.created = new Date();

  const currentRecords = records.filter(r => r.period === meta.currentPeriod);
  const byCategory: Array<{ label: string; value: number }> = (['cogs', 'labor', 'opex'] as const).map(cat => ({
    label: CATEGORY_LABEL[cat],
    value: currentRecords.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0),
  }));
  const slices = computePieSlices(byCategory);
  const dataUrl = renderPieChartPng(slices, { title: `Distribusi Biaya · ${meta.currentPeriod}` });

  const wsDash = wb.addWorksheet('Dashboard');
  wsDash.getCell('A1').value = `Dashboard Keuangan — ${meta.clientName} — ${meta.currentPeriod}`;
  wsDash.getCell('A1').font = { bold: true, size: 14 };
  wsDash.getCell('A2').value = 'Grafik di bawah adalah gambar statis (PNG), bukan native Excel chart — tidak bisa diedit datanya langsung dari Excel, hanya untuk tampilan.';
  wsDash.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  const imageId = wb.addImage({ base64: dataUrl, extension: 'png' });
  wsDash.addImage(imageId, 'A4:H24');

  const wsData = wb.addWorksheet('Data Mentah');
  wsData.columns = [{ header: 'Periode', key: 'period', width: 12 }, { header: 'Kategori', key: 'category', width: 14 }, { header: 'Nominal', key: 'amount', width: 18 }];
  currentRecords.forEach(r => wsData.addRow({ period: r.period, category: CATEGORY_LABEL[r.category], amount: r.amount }));
  wsData.getRow(1).font = { bold: true };

  const fileScope = meta.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `trace-dashboard-${fileScope}-${meta.currentPeriod}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Builds and downloads a multi-page PDF report with page header/footer + autoTable tables. */
export async function exportFinancePdf(
  comparison: FinanceComparison,
  meta: FinanceReportMeta,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const M = 40;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const navy: [number, number, number] = [23, 23, 23];

  const header = () => {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text('TRACE CONSULTANTS · Laporan Keuangan', M, 24);
    doc.text(meta.clientName, W - M, 24, { align: 'right' });
    doc.setDrawColor(230); doc.line(M, 30, W - M, 30);
  };
  const footer = (page: number, totalPagesExp: string) => {
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Halaman ${page} dari ${totalPagesExp}`, W - M, H - 18, { align: 'right' });
    doc.text(`Dibuat: ${new Date(meta.generatedAt ?? Date.now()).toLocaleDateString('id-ID')}`, M, H - 18);
  };

  doc.setFontSize(18); doc.setTextColor(...(navy as [number, number, number]));
  doc.text('Laporan Keuangan', M, 60);
  doc.setFontSize(11); doc.setTextColor(90);
  doc.text(`Klien: ${meta.clientName}`, M, 80);
  doc.text(`Periode: ${meta.currentPeriod}${meta.previousPeriod ? ` (dibandingkan ${meta.previousPeriod})` : ''}`, M, 96);

  doc.setFontSize(12); doc.setTextColor(...(navy as [number, number, number]));
  doc.text('Ringkasan', M, 124);
  autoTable(doc, {
    startY: 132, margin: { left: M, right: M, top: 38, bottom: 40 },
    head: [['Metrik', 'Nilai']], body: summaryRows(comparison.current),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    didDrawPage: header,
  });

  // @ts-expect-error jspdf-autotable still sets doc.lastAutoTable at runtime
  let y = doc.lastAutoTable.finalY + 24;
  doc.setFontSize(12); doc.setTextColor(...(navy as [number, number, number]));
  doc.text('Perbandingan Periode', M, y);
  autoTable(doc, {
    startY: y + 8, margin: { left: M, right: M, top: 38, bottom: 40 },
    head: [['Metrik', `Saat ini (${meta.currentPeriod})`, 'Sebelumnya', 'Perubahan', 'Perubahan %', 'Formula']],
    body: comparison.metrics.map(m => [
      m.metric, m.current === null ? 'Belum tersedia' : fmtRp(m.current), m.previous === null ? 'Belum tersedia' : fmtRp(m.previous),
      m.change === null ? 'Belum tersedia' : fmtRp(m.change), m.changePct === null ? 'Belum tersedia' : fmtPct(m.changePct), m.formula,
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: { 5: { cellWidth: 140 } },
    didDrawPage: header,
    didParseCell: (d: any) => {
      if (d.section === 'body' && (d.column.index === 3) && String(d.cell.raw).includes('-')) {
        d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.setFontSize(8); doc.setTextColor(140);
  // @ts-expect-error jspdf-autotable still sets doc.lastAutoTable at runtime
  const notesY = Math.min(doc.lastAutoTable.finalY + 20, H - 60);
  doc.text('Catatan: metrik yang datanya belum lengkap ditandai "Belum tersedia", bukan dianggap nol.', M, notesY, { maxWidth: W - M * 2 });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) { doc.setPage(i); footer(i, String(pageCount)); }

  const fileScope = meta.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  doc.save(`trace-consultant-${fileScope}-${meta.currentPeriod}.pdf`);
}

function groupRows(g: StatementGroup): (string | number)[][] {
  const rows: (string | number)[][] = g.lines.map(l => ['', l.label, l.amount]);
  rows.push(['', `Total ${g.title}`, g.total]);
  return rows;
}

/** Multi-sheet .xlsx matching a standard Laba Rugi layout (Pendapatan Usaha -> Laba
 *  Kotor -> Laba Operasi -> Laba Bersih), built from buildIncomeStatement() output. */
export async function exportIncomeStatementExcel(stmt: IncomeStatement, meta: FinanceReportMeta): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ['Laporan Laba Rugi'], [meta.clientName], [`Periode ${stmt.period}`], [],
    ['', 'Pendapatan'], ...groupRows(stmt.pendapatanUsaha), ['', 'Total Pendapatan', stmt.pendapatanUsaha.total], [],
    ['', 'Biaya Atas Pendapatan'], ...groupRows(stmt.biayaProduksi), ...groupRows(stmt.biayaUsahaLain),
    ['', 'Total Biaya Atas Pendapatan', stmt.totalBiayaAtasPendapatan], [],
    ['', 'Laba/Rugi Kotor', stmt.labaKotor], [],
    ['', 'Pengeluaran Operasional'], ...groupRows(stmt.biayaOperasional), ...groupRows(stmt.biayaNonOperasional),
    ['', 'Total Pengeluaran Operasional', stmt.totalPengeluaranOperasional], [],
    ['', 'Laba/Rugi Operasi', stmt.labaOperasi], [],
    ['', 'Pendapatan Lain'], ...groupRows(stmt.pendapatanLain),
    ['', 'Pengeluaran Lain'], ...groupRows(stmt.pengeluaranLain), [],
    ['', 'Laba/Rugi Bersih', stmt.labaBersih],
  ];
  if (stmt.unclassified.length) {
    rows.push([], ['', 'Belum diklasifikasi ke bagian laporan (perlu ditinjau)']);
    for (const u of stmt.unclassified) rows.push(['', u.label, u.amount]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 4 }, { wch: 40 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Laba Rugi');
  const fileScope = meta.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  XLSX.writeFile(wb, `trace-consultant-laba-rugi-${fileScope}-${stmt.period}.xlsx`);
}

/** Multi-page PDF, same hierarchical layout, bold subtotal/total rows. */
export async function exportIncomeStatementPdf(stmt: IncomeStatement, meta: FinanceReportMeta): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const M = 40; const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const navy: [number, number, number] = [23, 23, 23];

  const header = () => {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text('TRACE CONSULTANTS · Laporan Laba Rugi', M, 24);
    doc.text(meta.clientName, W - M, 24, { align: 'right' });
    doc.setDrawColor(230); doc.line(M, 30, W - M, 30);
  };

  doc.setFontSize(18); doc.setTextColor(...navy);
  doc.text('Laba Rugi', M, 60);
  doc.setFontSize(11); doc.setTextColor(90);
  doc.text(`${meta.clientName} · Periode ${stmt.period}`, M, 80);

  const body: (string | number)[][] = [];
  const boldRows: number[] = [];
  const pushGroup = (label: string, g: StatementGroup) => {
    body.push([label, '']);
    for (const l of g.lines) body.push([`   ${l.label}`, fmtRp(l.amount)]);
    body.push([`Total ${g.title}`, fmtRp(g.total)]); boldRows.push(body.length - 1);
  };
  pushGroup('Pendapatan Usaha', stmt.pendapatanUsaha);
  body.push(['Total Pendapatan', fmtRp(stmt.pendapatanUsaha.total)]); boldRows.push(body.length - 1);
  pushGroup('Biaya Produksi', stmt.biayaProduksi);
  pushGroup('Biaya Usaha Lain', stmt.biayaUsahaLain);
  body.push(['Total Biaya Atas Pendapatan', fmtRp(stmt.totalBiayaAtasPendapatan)]); boldRows.push(body.length - 1);
  body.push(['Laba/Rugi Kotor', fmtRp(stmt.labaKotor)]); boldRows.push(body.length - 1);
  pushGroup('Biaya Operasional', stmt.biayaOperasional);
  pushGroup('Biaya Non Operasional', stmt.biayaNonOperasional);
  body.push(['Total Pengeluaran Operasional', fmtRp(stmt.totalPengeluaranOperasional)]); boldRows.push(body.length - 1);
  body.push(['Laba/Rugi Operasi', fmtRp(stmt.labaOperasi)]); boldRows.push(body.length - 1);
  pushGroup('Pendapatan Lain', stmt.pendapatanLain);
  pushGroup('Pengeluaran Lain', stmt.pengeluaranLain);
  body.push(['Laba/Rugi Bersih', fmtRp(stmt.labaBersih)]); boldRows.push(body.length - 1);

  autoTable(doc, {
    startY: 100, margin: { left: M, right: M, top: 38, bottom: 40 },
    head: [['Akun', 'Saldo']], body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (d: any) => { if (d.section === 'body' && boldRows.includes(d.row.index)) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 244, 242]; } },
    didDrawPage: header,
  });

  if (stmt.unclassified.length) {
    doc.setFontSize(9); doc.setTextColor(185, 28, 28);
    // @ts-expect-error jspdf-autotable still sets doc.lastAutoTable at runtime
    doc.text(`Perhatian: ${stmt.unclassified.length} entri belum diklasifikasi ke bagian laporan manapun dan tidak ikut dihitung di atas.`, M, doc.lastAutoTable.finalY + 20, { maxWidth: W - M * 2 });
  }
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${pageCount}`, W - M, H - 18, { align: 'right' });
  }
  const fileScope = meta.clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'internal';
  doc.save(`trace-consultant-laba-rugi-${fileScope}-${stmt.period}.pdf`);
}
