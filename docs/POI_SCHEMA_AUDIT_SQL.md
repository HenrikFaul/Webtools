# POI schema audit SQL

Run the migration first, then use these queries in Supabase SQL Editor.

## 1. Show remaining canonical target mismatches

```sql
select *
from public.poi_etl_schema_audit
where not unified_ok or not local_ok or not same_datatype or not same_length
order by column_name;
```

Expected result after v4.1.5 migration: **0 rows**.

## 2. Show every relevant POI table column with datatype and length

```sql
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  is_nullable,
  column_default
from public.poi_table_column_types
order by table_name, ordinal_position;
```

Text fields should have `character_maximum_length = null`, meaning PostgreSQL unlimited `text` with no hidden varchar length cap.

## 3. Verify raw Geoapify source versus unified target counts

```sql
select count(*) as raw_geoapify_rows
from public.geoapify_pois
where external_id is not null;

select count(distinct external_id) as expected_distinct_geoapify
from public.geoapify_pois
where external_id is not null;

select count(distinct source_id) as unified_geoapify_rows
from public.unified_pois
where source_provider = 'geoapify';
```

## 4. Verify latest merge session

```sql
select
  source_provider,
  last_merge_session,
  count(*) as rows_in_latest_session,
  count(distinct source_id) as distinct_source_ids
from public.unified_pois
where last_merge_session is not null
  and source_provider = 'geoapify'
group by source_provider, last_merge_session
order by max(last_merged_at) desc
limit 5;
```

## 5. Emergency schema inspection without the audit view

Use this if the migration failed before `public.poi_etl_schema_audit` was created.

```sql
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('geoapify_pois', 'tomtom_pois', 'unified_pois', 'local_pois')
order by c.table_name, c.ordinal_position;
```

## 6. Check only target default/type risks before running the migration

```sql
select
  table_name,
  column_name,
  data_type,
  udt_name,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('unified_pois', 'local_pois')
  and column_name in (
    'name_international','categories','opening_hours','diet','payment_options','raw_data',
    'lat','lon','capacity','osm_id','outdoor_seating','indoor_seating','internet_access',
    'air_conditioning','takeaway','delivery','source_fetched_at','unified_at',
    'source_unified_at','last_merge_session','last_merged_at','last_load_session',
    'last_loaded_at','created_at','updated_at'
  )
order by table_name, column_name;
```
