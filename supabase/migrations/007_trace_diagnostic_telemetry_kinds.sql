-- Extend telemetry kinds to match the typed diagnostic contract. Additive.
alter table public.trace_diagnostic_events drop constraint if exists trace_diagnostic_events_kind_check;
alter table public.trace_diagnostic_events add constraint trace_diagnostic_events_kind_check check (kind in ('runtime','performance','network','data','job','test','supabase','dependency','security','usage'));
