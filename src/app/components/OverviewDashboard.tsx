import { useState } from 'react';
import type { ClientDriver, ClientHealthRow, DriverKind, MarginTrendPoint, PortfolioInsight, PortfolioSummary, TrendReading } from '../../core/portfolioHealth';
import { healthStatus } from '../../core/portfolioHealth';
import type { JalurModel } from '../portfolio';
import { dueLabel, type QueueBucket, type WorkQueue } from '../../core/workQueue';
import type { WorkstreamFinding } from '../../core/workstreams';
import { Card, DotMatrix, HealthMap, InsightOrb, LinkAction, MarginTrendChart, MetricTickCard, ScoreCard, StatusLegend, StatusPill, impactText } from './dash';
import { Icon, STATUS_META, type IconName } from './icons';

export interface OverviewModel {
  phase: 'loading' | 'ready' | 'error';
  error: string;
  progress: { done: number; total: number };
  /** Rows behind the KPI cards, list, insight and trend (one client when a client filter is set). */
  scopeRows: ClientHealthRow[];
  /** Every client — used by the map and the dot matrix so the selection stays visible in context. */
  allRows: ClientHealthRow[];
  summary: PortfolioSummary;
  allSummary: PortfolioSummary;
  trend: MarginTrendPoint[];
  reading: TrendReading | null;
  insight: PortfolioInsight;
  priority: Array<{ row: ClientHealthRow; driver: ClientDriver }>;
  jalur: JalurModel;
  queue: WorkQueue;
  /** Clients whose tasks could not be loaded (queue is incomplete for them). */
  tasksUnavailable: number;
  selectedClientId: string;
  selectedClientName: string;
  periodLabel: string;
  range: 3 | 6 | 12;
}

interface Props {
  model: OverviewModel;
  onSelectClient: (id: string) => void;
  onRange: (range: 3 | 6 | 12) => void;
  onOpenModule: (id: string) => void;
  onOpenTask: (clientId: string) => void;
  /** Open a module with the client already selected (deep link). clientId '' keeps the current selection. */
  /** Open a module for a client; `period` is optional because the global period already travels with the link. */
  onOpenFor: (moduleId: string, clientId: string, period?: string) => void;
  /** Ubah satu temuan jalur kerja jadi tugas nyata (owner=user login, due date+evidence dari temuan). Returns true bila berhasil. */
  onCreateTask: (clientId: string, finding: WorkstreamFinding) => Promise<boolean>;
  onShare: () => void;
  onExport: () => void;
  onReload: () => void;
}

const QUEUE_STYLE: Record<QueueBucket, { color: string; bg: string; label: string }> = {
  overdue: { color: STATUS_META.critical.color, bg: STATUS_META.critical.soft, label: 'Terlambat' },
  blocked: { color: STATUS_META.high.color, bg: STATUS_META.high.soft, label: 'Terblokir' },
  today: { color: STATUS_META.moderate.color, bg: STATUS_META.moderate.soft, label: 'Hari ini' },
  week: { color: '#4a4d58', bg: '#f0f0f3', label: '7 hari ke depan' },
  later: { color: '#4a4d58', bg: '#f0f0f3', label: 'Nanti' },
  nodate: { color: '#4a4d58', bg: '#f0f0f3', label: 'Tanpa tenggat' }
};

/** Where each kind of finding is worked on (ids from main.tsx nav). */
const DRIVER_MODULE: Record<DriverKind, { module: string; label: string }> = {
  margin: { module: 'cashflow', label: 'Arus Kas' },
  cogs: { module: 'recipecogs', label: 'Recipe COGS' },
  labor: { module: 'payroll', label: 'Payroll' },
  opex: { module: 'opex', label: 'OPEX Detail' },
  missing: { module: 'finance', label: 'Keuangan' },
  alert: { module: 'health', label: 'Business Health' },
  loaderror: { module: 'health', label: 'Business Health' }
};

const DRIVER_ICON: Record<DriverKind, { icon: IconName; tone: 'critical' | 'high' | 'nodata' | 'moderate' }> = {
  margin: { icon: 'trendDown', tone: 'critical' },
  alert: { icon: 'alert', tone: 'critical' },
  cogs: { icon: 'flame', tone: 'high' },
  labor: { icon: 'users', tone: 'moderate' },
  opex: { icon: 'wallet', tone: 'moderate' },
  missing: { icon: 'file', tone: 'nodata' },
  loaderror: { icon: 'alert', tone: 'nodata' }
};

function Skeleton({ progress }: { progress: { done: number; total: number } }) {
  return (
    <div className="tr-grid" aria-busy="true" aria-live="polite">
      <div className="tr-span-4 tr-loading-note">{progress.total ? `Memuat data ${progress.done}/${progress.total} klien…` : 'Memuat daftar klien…'}</div>
      {[0, 1, 2, 3].map(i => <div key={i} className="tr-card tr-skel" style={{ height: 150 }} />)}
      <div className="tr-card tr-skel tr-span-2" style={{ height: 380 }} />
      <div className="tr-card tr-skel" style={{ height: 380 }} />
      <div className="tr-card tr-skel" style={{ height: 380 }} />
      <div className="tr-card tr-skel tr-span-2" style={{ height: 300 }} />
      <div className="tr-card tr-skel tr-span-2" style={{ height: 300 }} />
      <div className="tr-card tr-skel tr-span-4" style={{ height: 260 }} />
      <div className="tr-card tr-skel tr-span-4" style={{ height: 260 }} />
    </div>
  );
}

/** Tombol "Jadikan tugas" per temuan jalur kerja — state lokal (idle/menyimpan/selesai) supaya klik ganda tidak membuat tugas dobel. */
function WorkstreamTaskButton({ clientId, finding, onCreateTask }: { clientId: string; finding: WorkstreamFinding; onCreateTask: Props['onCreateTask'] }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  if (state === 'done') return <span className="tr-cta" style={{ color: STATUS_META.healthy.color }}>Tugas dibuat <Icon name="check" size={13} /></span>;
  return (
    <button
      type="button"
      className="tr-jalur-task-btn"
      disabled={state === 'saving'}
      onClick={async e => {
        e.stopPropagation();
        setState('saving');
        const ok = await onCreateTask(clientId, finding);
        setState(ok ? 'done' : 'idle');
      }}
    >
      {state === 'saving' ? 'Menyimpan…' : 'Jadikan tugas'}
    </button>
  );
}

export function OverviewDashboard({ model, onSelectClient, onRange, onOpenModule, onOpenTask, onOpenFor, onCreateTask, onShare, onExport, onReload }: Props) {
  const { summary, allSummary, insight, reading } = model;
  const scoped = !!model.selectedClientId;
  const avgStatus = healthStatus(summary.averageScore);
  const impact = impactText(insight.impact);
  const confidence = insight.confidencePct;
  const empty = model.phase === 'ready' && model.allRows.length === 0;

  return (
    <div className="tr-overview">
      <div className="tr-pagehead">
        <div>
          <h1>Business Health Overview</h1>
          <p>{scoped ? `Kesehatan finansial ${model.selectedClientName} · ${model.periodLabel}` : `Pantau kesehatan finansial dan operasional seluruh klien F&B Anda · ${model.periodLabel}`}</p>
        </div>
        <div className="tr-pagehead-actions">
          <button type="button" className="tr-btn tr-btn-light" onClick={onShare}>Bagikan<Icon name="share" size={15} /></button>
          <button type="button" className="tr-btn tr-btn-dark" onClick={onExport} disabled={model.phase !== 'ready' || empty}>Ekspor<Icon name="download" size={15} /></button>
        </div>
      </div>

      {model.phase === 'error' && (
        <div className="trace-recovery-banner" role="alert" style={{ marginBottom: 16 }}>
          Data klien gagal dimuat: {model.error} <button type="button" className="trace-link-button" onClick={onReload}>Coba lagi</button>
        </div>
      )}

      {model.phase === 'loading' ? <Skeleton progress={model.progress} /> : (
        <div className="tr-grid">
          <ScoreCard
            title={scoped ? model.selectedClientName : 'Skor Kesehatan'}
            score={summary.averageScore}
            status={avgStatus}
            deltaPts={summary.scoreDelta}
            note={summary.scoredCount ? 'Belum ada periode pembanding' : 'Belum ada klien dengan data cukup'}
            onOpen={() => onOpenFor('health', model.selectedClientId)} openLabel="Buka Business Health"
          />
          <MetricTickCard title="Klien Berisiko" icon="alert" iconColor={STATUS_META.moderate.color} valueText={summary.atRiskPct === null ? '—' : String(summary.atRiskPct)} unit={summary.atRiskPct === null ? undefined : '%'} pct={summary.atRiskPct} color="#e0a81f" metaMain={`${summary.atRiskCount} klien`} metaSub={`dari ${summary.scoredCount} yang dinilai`} onOpen={() => onOpenFor('health', model.selectedClientId)} openLabel="Buka Business Health" />
          <MetricTickCard title="Alert Aktif" icon="bell" iconColor={STATUS_META.critical.color} valueText={String(summary.openAlerts)} unit="aktif" pct={summary.openAlerts ? Math.round((summary.severeAlerts / summary.openAlerts) * 100) : null} color="#e5344f" metaMain={`${summary.severeAlerts} tinggi/kritis`} metaSub="alert tersimpan" onOpen={() => onOpenFor('health', model.selectedClientId)} openLabel="Buka Business Health untuk melihat alert" />
          <MetricTickCard title="Cakupan Data" icon="globe" iconColor="#1fa3b8" valueText={summary.coveragePct === null ? '—' : String(summary.coveragePct)} unit={summary.coveragePct === null ? undefined : '%'} pct={summary.coveragePct} color="#1fb5c8" metaMain={`${summary.complete} klien`} metaSub={`data lengkap dari ${summary.rows.length}`} onOpen={() => onOpenFor('intake', model.selectedClientId)} openLabel="Buka Data Intake untuk melengkapi data" />

          <Card className="tr-span-2 tr-map-card" title="Peta Kesehatan Klien" action={<span className="tr-hint">Luas area mengikuti revenue</span>}>
            {model.allRows.length ? (
              <>
                <HealthMap rows={model.allRows} selectedId={model.selectedClientId} onSelect={onSelectClient} />
                <StatusLegend counts={allSummary.counts} previous={allSummary.previousCounts} />
              </>
            ) : (
              <div className="tr-empty-chart" style={{ minHeight: 300 }}>
                <p>Belum ada klien terdaftar.</p>
                <button type="button" className="tr-btn tr-btn-dark" onClick={() => onOpenModule('clients')}>Tambah klien</button>
              </div>
            )}
          </Card>

          <Card title="Eksposur Risiko" className="tr-exposure">
            <DotMatrix rows={model.allRows} selectedId={model.selectedClientId} onSelect={onSelectClient} />
            <ul className="tr-pills-legend">
              {(['healthy', 'moderate', 'high', 'critical'] as const).map(k => (
                <li key={k}><i style={{ background: STATUS_META[k].color }} />{STATUS_META[k].label}<b>{allSummary.counts[k]}</b></li>
              ))}
            </ul>
            {allSummary.counts.nodata > 0 && <p className="tr-foot">{allSummary.counts.nodata} klien belum punya data cukup dan tidak ditampilkan.</p>}
          </Card>

          <Card
            title="Tren Operating Margin"
            className="tr-trend-card"
            action={
              <label className="tr-chip tr-chip-sm">
                <span>{model.range} bulan</span><Icon name="chevron" size={13} />
                <select aria-label="Rentang tren" value={model.range} onChange={e => onRange(Number(e.target.value) as 3 | 6 | 12)}>
                  <option value={3}>3 bulan</option><option value={6}>6 bulan</option><option value={12}>12 bulan</option>
                </select>
              </label>
            }
          >
            <MarginTrendChart points={model.trend} reading={reading} />
            <div className="tr-note">
              <strong>
                {reading
                  ? `Operating margin ${reading.deltaPts < 0 ? 'turun' : reading.deltaPts > 0 ? 'naik' : 'stabil'}${reading.deltaPts === 0 ? '' : ` ${Math.abs(reading.deltaPts).toFixed(1)} pt`} dalam ${reading.periods} periode.`
                  : 'Tren belum bisa dihitung.'}
              </strong>
              <span>
                {reading && reading.driver && reading.driverDeltaPts !== null
                  ? `${reading.driver} ${reading.driverDeltaPts > 0 ? 'naik' : 'turun'} ${Math.abs(reading.driverDeltaPts).toFixed(1)} pt dari revenue — paling berpengaruh.`
                  : reading ? 'Tidak ada satu komponen biaya yang menonjol.' : 'Dihitung dari klien dengan data finance lengkap per periode.'}
              </span>
            </div>
          </Card>

          <Card className="tr-span-2 tr-priority" title="Prioritas Klien" action={<LinkAction onClick={() => onOpenModule('health')}>Lihat detail</LinkAction>}>
            {model.priority.length ? (
              <ul className="tr-feed">
                {model.priority.map(({ row, driver }) => {
                  const meta = DRIVER_ICON[driver.kind];
                  const target = DRIVER_MODULE[driver.kind];
                  const c = STATUS_META[meta.tone];
                  return (
                    <li key={`${row.id}-${driver.kind}`}>
                      <button type="button" onClick={() => onOpenFor(target.module, row.id)} title={`Buka ${target.label} untuk ${row.name}`}>
                        <span className="tr-feed-ico" style={{ color: c.color, background: c.soft }}><Icon name={meta.icon} size={17} /></span>
                        <span className="tr-feed-text"><strong>{driver.title}</strong><small>{row.name}{row.period ? ` · ${row.period}` : ''}</small></span>
                        <StatusPill tone={meta.tone === 'nodata' ? 'info' : meta.tone}>{driver.short}</StatusPill>
                        <span className="tr-feed-when"><i />{row.score === null ? 'Belum dinilai' : `Skor ${row.score}`}<em className="tr-cta">{target.label} <Icon name="arrow" size={13} /></em></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="tr-empty-chart" style={{ minHeight: 190 }}>{empty ? 'Belum ada klien.' : 'Tidak ada klien yang perlu perhatian pada periode ini.'}</div>
            )}
          </Card>

          <Card className="tr-span-2 tr-insight" title="Intelligence Insight" action={<LinkAction onClick={() => onOpenModule('ai')}>Buka Intelligence</LinkAction>}>
            <p className="tr-insight-sub">{insight.headline}</p>
            <div className="tr-insight-body">
              <div className="tr-insight-stats">
                <div className="tr-stat">
                  <span className="tr-medallion tr-medallion-lg" style={{ color: STATUS_META.healthy.color, background: STATUS_META.healthy.soft }}><Icon name="shield" size={20} /></span>
                  <div><b style={{ color: confidence === null ? 'var(--tr-faint)' : STATUS_META.healthy.color }}>{confidence === null ? '—' : `${confidence}%`}</b><small>Confidence</small></div>
                </div>
                <div className="tr-stat">
                  <span className="tr-medallion tr-medallion-lg" style={{ color: impact.color, background: 'rgba(229,52,79,.09)' }}><Icon name="alert" size={20} /></span>
                  <div><b style={{ color: impact.color }}>{impact.label}</b><small>Potensi dampak</small></div>
                </div>
                <p className="tr-foot">{insight.detail} Ringkasan otomatis berbasis aturan, bukan analisis AI.</p>
              </div>
              <InsightOrb counts={allSummary.counts} />
            </div>
          </Card>

          <Card className="tr-span-4 tr-jalur" title={model.jalur.selected ? `Jalur Kerja · ${model.jalur.selected.name}` : 'Jalur Kerja yang Dibutuhkan'}
            action={model.jalur.selected
              ? <span className="tr-mode" data-mode={model.jalur.selected.plan.mode}>{model.jalur.selected.plan.label}</span>
              : <span className="tr-hint">Menyala hanya bila ada bukti dari data</span>}>
            {model.jalur.selected ? (
              <div className="tr-jalur-grid">
                <div>
                  {model.jalur.selected.plan.flagged.length ? (
                    <ul className="tr-jalur-list">
                      {model.jalur.selected.plan.flagged.map(f => (
                        <li key={`${model.selectedClientId}-${f.key}`}>
                          <button type="button" className="tr-jalur-open" onClick={() => onOpenFor(f.module, model.selectedClientId)} title={`Buka ${f.moduleLabel} untuk ${model.jalur.selected?.name ?? ''}`}>
                            <i data-sev={f.severity} /><div><strong>{f.label}</strong><small>{f.reason}</small></div>
                            <span className="tr-cta">Buka {f.moduleLabel} <Icon name="arrow" size={13} /></span>
                          </button>
                          <WorkstreamTaskButton clientId={model.selectedClientId} finding={f} onCreateTask={onCreateTask} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="tr-empty-chart" style={{ minHeight: 90 }}>{model.jalur.selected.plan.mode === 'belum' ? 'Belum bisa dinilai — lengkapi data finance klien ini dulu.' : 'Tidak ada jalur yang menyala dari data yang tersedia.'}</div>
                  )}
                  {model.jalur.selected.ok.length > 0 && <p className="tr-foot">Aman pada data yang ada: {model.jalur.selected.ok.map(f => f.label).join(', ')}.</p>}
                  {model.jalur.selected.nodata.length > 0 && <p className="tr-foot">Belum bisa dinilai (data kurang): {model.jalur.selected.nodata.map(f => f.label).join(', ')}.</p>}
                </div>
                <div className="tr-manual">
                  <h3>Perlu asesmen langsung</h3>
                  <ul>{model.jalur.selected.plan.manual.map(f => <li key={`${model.selectedClientId}-${f.key}`}><button type="button" onClick={() => onOpenFor(f.module, model.selectedClientId)}><strong>{f.label}</strong><small>{f.reason}</small><span className="tr-cta">Buka {f.moduleLabel} <Icon name="arrow" size={13} /></span></button><WorkstreamTaskButton clientId={model.selectedClientId} finding={f} onCreateTask={onCreateTask} /></li>)}</ul>
                </div>
              </div>
            ) : (
              <div className="tr-jalur-grid">
                <div>
                  {model.jalur.rollup.length ? (
                    <ul className="tr-jalur-list">
                      {model.jalur.rollup.map(r => (
                        <li key={r.key}>
                          <span className="tr-count">{r.clients.length}</span>
                          <div><strong>{r.label}</strong>
                            <small>Dikerjakan di {r.moduleLabel}{r.clients.length > 3 ? ` · +${r.clients.length - 3} klien lain (pilih klien di filter)` : ''}</small></div>
                          <span className="tr-chips">{r.clients.slice(0, 3).map(c => <button key={c.id} type="button" onClick={() => onOpenFor(r.module, c.id)} title={c.reason}>{c.name} <Icon name="arrow" size={12} /></button>)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="tr-empty-chart" style={{ minHeight: 90 }}>{empty ? 'Belum ada klien.' : 'Belum ada jalur yang menyala dari data finance klien yang tersedia.'}</div>
                  )}
                  <p className="tr-foot">Klik nama klien untuk langsung membuka modul pengerjaannya. Pilih satu klien di filter atas untuk melihat jalur kerja lengkapnya: satu area saja, beberapa, atau kerja total.</p>
                </div>
                <div className="tr-manual">
                  <h3>Tidak punya data otomatis</h3>
                  <ul>{model.jalur.manual.map(m => <li key={m.label}><strong>{m.label}</strong><small>{m.hint}</small></li>)}</ul>
                </div>
              </div>
            )}
          </Card>

          <Card className="tr-span-4 tr-queue" title="Antrean Kerja" action={<LinkAction onClick={() => onOpenModule('business')}>Buka tugas klien</LinkAction>}>
            <div className="tr-queue-stats">
              {(['overdue', 'today', 'week', 'blocked'] as const).map(b => (
                <div key={b} className="tr-queue-stat">
                  <b style={{ color: model.queue.counts[b] > 0 && (b === 'overdue' || b === 'blocked') ? QUEUE_STYLE[b].color : 'var(--tr-ink)' }}>{model.queue.counts[b]}</b>
                  <span>{b === 'week' ? 'Minggu ini' : QUEUE_STYLE[b].label}</span>
                </div>
              ))}
              <div className="tr-queue-stat"><b>{model.queue.openTotal}</b><span>Tugas terbuka</span></div>
            </div>
            {model.queue.items.length ? (
              <ul className="tr-feed tr-queue-list">
                {model.queue.items.map(item => {
                  const st = QUEUE_STYLE[item.bucket];
                  return (
                    <li key={item.task.id}>
                      <button type="button" onClick={() => onOpenTask(item.task.clientId)}>
                        <span className="tr-prio" data-p={item.task.priority}>{item.task.priority}</span>
                        <span className="tr-feed-text"><strong>{item.task.title}</strong><small>{item.task.clientName}</small></span>
                        <span className="tr-pill" style={{ color: st.color, background: st.bg }}>{dueLabel(item)}</span>
                        <Icon name="arrow" size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="tr-empty-chart" style={{ minHeight: 120 }}>{empty ? 'Belum ada klien.' : 'Belum ada tugas terbuka. Buat tugas dari Business Twin agar pekerjaan tiap klien terlihat di sini.'}</div>
            )}
            {model.queue.clientsWithoutTasks.length > 0 && !empty && (
              <p className="tr-foot">
                {model.queue.clientsWithoutTasks.length} klien belum punya tugas aktif: {model.queue.clientsWithoutTasks.slice(0, 3).map(c => c.name).join(', ')}{model.queue.clientsWithoutTasks.length > 3 ? ', …' : ''}.
              </p>
            )}
            {model.tasksUnavailable > 0 && <p className="tr-foot">Tugas {model.tasksUnavailable} klien gagal dimuat, jadi antrean ini belum lengkap.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
