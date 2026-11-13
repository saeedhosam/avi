-- Avi is dark-only. Theme selection is no longer an application state, so
-- remove the obsolete per-profile preference rather than leaving a column that
-- no client reads or writes.
alter table public.profiles
  drop column if exists theme_preference;
