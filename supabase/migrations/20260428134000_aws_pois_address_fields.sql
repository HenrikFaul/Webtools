alter table if exists public.aws_pois
  add column if not exists state_region_code text,
  add column if not exists sub_region_name text,
  add column if not exists sub_region_code text,
  add column if not exists street_components jsonb not null default '[]'::jsonb;

create index if not exists aws_pois_sub_region_code_idx on public.aws_pois (sub_region_code);
