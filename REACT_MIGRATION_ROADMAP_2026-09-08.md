# TRACE React Migration Roadmap

React migration is incremental, not a destructive rewrite.

1. Typed core: evidence, calculations, scoring.
2. Shared design system: Tailwind + shadcn/Radix + Lucide.
3. Shell migration: sidebar, topbar, command palette, mobile nav.
4. Module migration in timeline order.
5. Supabase data contracts and RLS boundaries.
6. Regression parity checks before retiring legacy views.

Legacy `index.html` remains available during migration so existing data and workflows are not discarded.
