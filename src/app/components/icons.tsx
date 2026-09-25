import type { HealthStatus } from '../../core/portfolioHealth';

/** Thin-stroke icon set used by the shell and dashboard (keeps the light, editorial look). */
const PATHS = {
  home: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  users: 'M16 19v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 17.8V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM20 19v-1.2a3.8 3.8 0 0 0-2.6-3.6M14.8 4.8a3.2 3.2 0 0 1 0 6',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h12.5a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 8H6.5A2.5 2.5 0 0 1 4 5.5M16 13.5h.01',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  sparkle: 'M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9 12 3.5ZM18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z',
  database: 'M12 10.5c4 0 7-1.3 7-3s-3-3-7-3-7 1.3-7 3 3 3 7 3ZM5 7.5v4.5c0 1.7 3 3 7 3s7-1.3 7-3V7.5M5 12v4.5c0 1.7 3 3 7 3s7-1.3 7-3V12',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5l1.1.9-1.5 2.6-1.4-.4a7.5 7.5 0 0 1-1.6.9l-.3 1.5h-3l-.3-1.5a7.5 7.5 0 0 1-1.6-.9l-1.4.4-1.5-2.6 1.1-.9a7.7 7.7 0 0 1 0-1.8l-1.1-.9 1.5-2.6 1.4.4a7.5 7.5 0 0 1 1.6-.9l.3-1.5h3l.3 1.5c.6.2 1.1.5 1.6.9l1.4-.4 1.5 2.6-1.1.9c.1.6.1 1.2 0 1.8Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0',
  chevron: 'm6 9 6 6 6-6',
  share: 'M17.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.7 13.2l6.6 3.6M15.3 7.2 8.7 10.8',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  alert: 'M12 4 3.5 19h17L12 4ZM12 10v4.2M12 16.8h.01',
  flame: 'M12 3c.4 3-2.6 4.6-2.6 7.6 0 1 .4 1.8 1 2.3-.1-1.6.9-2.6 2-3.3.2 2.6 2.6 3.2 2.6 5.6A3.6 3.6 0 0 1 12 19.5 4.6 4.6 0 0 1 7.5 15c0-4.4 4-6 4.5-12Z',
  drop: 'M12 3.5s6 6.2 6 10.4A6 6 0 0 1 6 13.9C6 9.7 12 3.5 12 3.5Z',
  trendDown: 'm4 7 6 6 3.5-3.5L20 16M20 16v-4.5M20 16h-4.5',
  trendUp: 'm4 16 6-6 3.5 3.5L20 7M20 7v4.5M20 7h-4.5',
  shield: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.3 7 9 4.1-1.7 7-4.8 7-9V6l-7-2.5ZM8.8 12l2.4 2.4 4-4.3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  locate: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 3v3M12 18v3M3 12h3M18 12h3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 12h17M12 3.2c2.4 2.5 3.6 5.5 3.6 8.8s-1.2 6.300-3.600 8.800c-2.400-2.500-3.600-5.500-3.600-8.800S9.600 5.700 12 3.200Z',
  file: 'M7 3.5h6.5L18 8v12.5H7v-17ZM13.5 3.5V8H18M9.5 12.5h5M9.5 16h5',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.500 4.500L19 7.500',
  more: 'M6 12h.01M12 12h.01M18 12h.01'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** One palette, used by map, dot matrix, gauge, pills and legend so a status always looks the same. */
export const STATUS_META: Record<HealthStatus, { label: string; color: string; soft: string; relief: string }> = {
  healthy: { label: 'Sehat', color: '#1f9d55', soft: 'rgba(31,157,85,.10)', relief: '#86c96a' },
  moderate: { label: 'Sedang', color: '#c98a00', soft: 'rgba(224,168,31,.14)', relief: '#e6c04d' },
  high: { label: 'Tinggi', color: '#e07a12', soft: 'rgba(240,138,36,.13)', relief: '#f2a35a' },
  critical: { label: 'Kritis', color: '#dc2f4a', soft: 'rgba(229,52,79,.10)', relief: '#e8656f' },
  nodata: { label: 'Data belum cukup', color: '#0e93a8', soft: 'rgba(31,181,200,.12)', relief: '#5fc9cc' }
};
