# TRACE Phase 22 — Premium UI Audit v62

## Baseline
- BEFORE screenshots supplied by user: desktop/mobile legacy TRACE + Acquisition.
- Current source baseline: v61 / production legacy `index.html`, Acquisition embedded feature, React foundation.
- Patch baseline: `TRACE_FIX_PATCH` fixes lockfile/React Vite output/typecheck path.

## Concrete findings
1. Desktop shell had inconsistent density between sidebar, topbar and content.
2. React mobile shell had no dedicated quick navigation.
3. Cards, forms, tables and focus states used inconsistent visual tokens.
4. Acquisition had a separate visual language and direct/embedded divergence.
5. React command button had no interaction contract.

## Fixes
- Additive premium visual layer to production legacy shell.
- Responsive mobile polish and safe-area-aware navigation.
- Acquisition unified to TRACE premium light visual language.
- React command palette + Ctrl/Cmd+K.
- React mobile quick navigation.
- React PWA metadata/manifest reference.
- Existing DOM IDs and legacy JS contracts preserved.

## Gate status
Core/static tests must be rerun after packaging. Real browser, Supabase/RLS and Netlify deployment verification remain separate gates.
