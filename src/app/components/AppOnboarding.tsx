import { useEffect, useState } from 'react';
import { LayoutDashboard, Target, Brain, type LucideIcon } from 'lucide-react';

const ONBOARDING_SEEN_KEY = 'trace_os::onboardingSeen';

interface Slide { icon: LucideIcon; title: string; body: string }

const SLIDES: Slide[] = [
  {
    icon: LayoutDashboard,
    title: 'Semua klien, satu layar',
    body: 'Overview menunjukkan status kesehatan tiap klien — Sehat, Sedang, Tinggi, atau Kritis — sebelum kamu masuk ke detail satu per satu.'
  },
  {
    icon: Target,
    title: 'Temukan calon klien F&B',
    body: 'Acquisition mencari dan menilai calon klien kafe, resto, dan bakery di Bogor, lalu menyiapkan draf outreach yang personal untuk tiap calon klien.'
  },
  {
    icon: Brain,
    title: 'AI Center, berbasis evidence',
    body: 'Business Advisor dan Guardian menjawab dari data yang benar-benar ada di TRACE, dan bilang terus terang kalau datanya belum cukup — bukan menebak angka.'
  }
];

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { return true; }
}

function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* private mode / storage disabled: just skip past it */ }
}

export function AppOnboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const finish = () => { markOnboardingSeen(); onDone(); };
  const next = () => (last ? finish() : setIndex(i => i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
      else if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  return (
    <main className="trace-auth-screen">
      <div className="trace-auth-card trace-onboard-card">
        <button type="button" className="trace-link-button trace-onboard-skip" onClick={finish}>Lewati</button>
        <div className="trace-onboard-icon"><Icon size={26} strokeWidth={1.6} /></div>
        <h1>{slide.title}</h1>
        <p className="trace-muted">{slide.body}</p>
        <div className="trace-onboard-dots" role="tablist" aria-label="Langkah pengenalan">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Langkah ${i + 1} dari ${SLIDES.length}`}
              className="trace-onboard-dot"
              data-active={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <button type="button" className="trace-button trace-onboard-next" onClick={next}>{last ? 'Mulai' : 'Lanjut'}</button>
      </div>
    </main>
  );
}
