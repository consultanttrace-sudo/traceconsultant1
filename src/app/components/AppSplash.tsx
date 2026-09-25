import { useEffect, useRef } from 'react';

interface Props {
  /** Start the fade-out. The component keeps rendering (to finish the transition) until onExited fires. */
  hidden: boolean;
  /** Called ~550ms after `hidden` turns true, once the fade-out transition has finished. */
  onExited?: () => void;
}

/**
 * First-paint intro screen. Same dark gradient + glow + logo treatment as the
 * legacy monolith's #appSplash (index.html), ported to React so the new app
 * shell isn't a bare white screen before the session check resolves.
 */
export function AppSplash({ hidden, onExited }: Props) {
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => onExitedRef.current?.(), 550);
    return () => clearTimeout(t);
    // Only re-arm this timer when `hidden` itself flips — not on every parent
    // re-render (e.g. a Supabase onAuthStateChange tick) passing a fresh callback.
  }, [hidden]);

  return (
    <div className={`app-splash${hidden ? ' app-splash-out' : ''}`} role="status" aria-live="polite" aria-label="Memuat TRACE OS">
      <div className="app-splash-glow" />
      <div className="app-splash-logo-wrap">
        <img src="/logo.png" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <div className="app-splash-title">TRACE OS</div>
      <div className="app-splash-sub">Consultant Operating System</div>
      <div className="app-splash-bar" />
    </div>
  );
}
