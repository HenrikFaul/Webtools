# POI schema audit SQL

Run the migration first, then use these queries in Supabase SQL Editor.

## 1. Show remaining canonical target mismatches

```sql
select *
from public.poi_etl_schema_audit
where not unified_ok or not local_ok
order by column_name;
```

Expected result after v4.1.4 migration: **0 rows**.

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
