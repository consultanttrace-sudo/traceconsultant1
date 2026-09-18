# TRACE Consultant OS — Acquisition Safety Upgrade (2026-08-21)

## Principle
Only isolated Acquisition code and the existing Acquisition navigation bridge were changed. TRACE Consultant core modules, storage ordering, Supabase auth/RLS, financial calculations, and existing client structure were not rewritten.

## Changes
1. Fixed Acquisition storage adapter initialization order (runtime TDZ bug).
2. Added one-time, non-destructive migration from the prior standalone `acquisitionLeads` localStorage into `trace-acquisition-leads`; existing cloud leads are preserved and duplicates are skipped.
3. Added baked-in embedded mode so Acquisition has no second dark sidebar/application chrome when opened from TRACE Consultant, including local file testing.
4. Kept the iframe isolation boundary deliberately to reduce risk to stable V17 modules; the user-facing result is a seamless TRACE-native feature.
5. Added parent/child tab synchronization.
6. Escaped external/imported lead values in cards, tables, detail views, social signals, outreach history, recommendations, and notes.
7. Left discovery providers, Overpass batching, Google proxy, auth, conversion bridge, scoring, and TRACE core calculations unchanged.

## Validation
- TRACE V17 static assertions: 13/13 PASS before patch.
- TRACE inline JS syntax: PASS before patch.
- Acquisition inline JS syntax: PASS before patch.
- Post-patch syntax checks and static assertions are required before release.
