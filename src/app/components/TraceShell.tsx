import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export interface NavItem { id: string; label: string; icon: ReactNode }
export interface NavGroup { id: string; label: string; icon: IconName; items: string[] }

export interface FilterChip {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

interface Props {
  nav: NavItem[];
  /** Rail groups shown at the top. */
  groups: NavGroup[];
  /** Rail groups pinned to the bottom (e.g. data intake, system). */
  footerGroups: NavGroup[];
  active: string;
  onNavigate: (id: string) => void;
  onOpenPalette: () => void;
  /** Filter chips in the top bar. Omit on pages that manage their own scope. */
  filters?: FilterChip[];
  bellCount: number;
  onBell: () => void;
  avatarInitial: string;
  avatarLabel: string;
  toast: string;
  /** Small tag shown in the top bar for modules that are internal / not client-scoped. */
  contextLabel?: string;
  children: ReactNode;
}

const MOBILE_IDS = ['overview', 'health', 'clients', 'finance', 'ai'];

function RailButton({ group, activeId, open, onToggle, nav, onNavigate }: { group: NavGroup; activeId: string; open: boolean; onToggle: () => void; nav: NavItem[]; onNavigate: (id: string) => void }) {
  const isActive = group.items.includes(activeId);
  const single = group.items.length === 1;
  return (
    <div className="tr-rail-item">
      <button
        type="button"
        className="tr-rail-btn"
        data-active={isActive}
        aria-label={group.label}
        aria-expanded={single ? undefined : open}
        aria-haspopup={single ? undefined : 'menu'}
        title={group.label}
        onClick={() => (single ? onNavigate(group.items[0]) : onToggle())}
      >
        <Icon name={group.icon} size={19} />
      </button>
      {open && !single && (
        <div className="tr-flyout" role="menu" aria-label={group.label}>
          <h3>{group.label}</h3>
          {group.items.map(id => {
            const item = nav.find(n => n.id === id);
            if (!item) return null;
            return (
              <button key={id} type="button" role="menuitem" data-active={activeId === id} onClick={() => onNavigate(id)}>
                {item.icon}<span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TraceShell({ nav, groups, footerGroups, active, onNavigate, onOpenPalette, filters, bellCount, onBell, avatarInitial, avatarLabel, toast, contextLabel, children }: Props) {
  const [openGroup, setOpenGroup] = useState('');
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => { if (railRef.current && !railRef.current.contains(e.target as Node)) setOpenGroup(''); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenGroup(''); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openGroup]);

  const go = (id: string) => { setOpenGroup(''); onNavigate(id); };
  const mobile = MOBILE_IDS.map(id => nav.find(n => n.id === id)).filter((n): n is NavItem => !!n);

  return (
    <div className="tr-app">
      <div className="tr-frame">
        <aside className="tr-rail" ref={railRef} aria-label="Navigasi utama">
          <button type="button" className="tr-logo" aria-label="Ke Overview" onClick={() => go('overview')}>
            <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
              {[[8, 5], [17, 4], [22, 11], [12, 12], [5, 16], [15, 20], [23, 21], [9, 24]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.1 : 2.3} fill="#14141a" />)}
            </svg>
          </button>
          <nav className="tr-rail-nav">
            {groups.map(g => <RailButton key={g.id} group={g} activeId={active} open={openGroup === g.id} onToggle={() => setOpenGroup(openGroup === g.id ? '' : g.id)} nav={nav} onNavigate={go} />)}
          </nav>
          <div className="tr-rail-foot">
            {footerGroups.map(g => <RailButton key={g.id} group={g} activeId={active} open={openGroup === g.id} onToggle={() => setOpenGroup(openGroup === g.id ? '' : g.id)} nav={nav} onNavigate={go} />)}
          </div>
        </aside>

        <div className="tr-main">
          <header className="tr-topbar">
            <button type="button" className="tr-logo tr-logo-mobile" aria-label="Ke Overview" onClick={() => go('overview')}>
              <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="#14141a" /><circle cx="19" cy="7" r="2.3" fill="#14141a" /><circle cx="14" cy="16" r="3" fill="#14141a" /><circle cx="6" cy="21" r="2.3" fill="#14141a" /><circle cx="22" cy="21" r="3" fill="#14141a" /></svg>
            </button>
            <button type="button" className="tr-search" onClick={onOpenPalette} aria-label="Cari modul (Ctrl K)">
              <Icon name="search" size={18} /><span>Cari modul atau halaman</span><kbd>Ctrl K</kbd>
            </button>
            {contextLabel && <span className="tr-context-tag">{contextLabel}</span>}
            <div className="tr-topbar-spacer" />
            {filters && (
              <div className="tr-filters" role="group" aria-label="Filter data">
                {filters.map(f => {
                  const current = f.options.find(o => o.value === f.value)?.label ?? f.label;
                  return (
                    <label key={f.id} className="tr-chip">
                      <span>{current}</span><Icon name="chevron" size={14} />
                      <select aria-label={f.label} value={f.value} onChange={e => f.onChange(e.target.value)}>
                        {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
            <button type="button" className="tr-square" onClick={onBell} aria-label={bellCount ? `${bellCount} alert aktif — buka Business Health` : 'Tidak ada alert aktif'}>
              <Icon name="bell" size={18} />{bellCount > 0 && <i className="tr-dot" />}
            </button>
            <span className="tr-avatar" title={avatarLabel} aria-label={avatarLabel}>{avatarInitial}</span>
          </header>
          <main className="trace-content tr-content">{children}</main>
        </div>

        <nav className="tr-mobile-nav" aria-label="Navigasi cepat mobile">
          {mobile.map(n => <button key={n.id} type="button" data-active={active === n.id} onClick={() => go(n.id)}>{n.icon}<span>{n.label}</span></button>)}
          <button type="button" onClick={onOpenPalette}><Icon name="more" size={18} /><span>Lainnya</span></button>
        </nav>
      </div>
      <div className="tr-toast" role="status" aria-live="polite" data-show={!!toast}>{toast}</div>
    </div>
  );
}
