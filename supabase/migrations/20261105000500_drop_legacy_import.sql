-- No legacy Firestore data will be migrated. Remove the unused staging path.

drop function if exists public.claim_legacy_data();
drop table if exists public.legacy_imports;
