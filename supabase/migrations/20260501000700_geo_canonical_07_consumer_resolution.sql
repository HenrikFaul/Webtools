-- Migration: geo_canonical_07_consumer_resolution

CREATE TABLE geo.consumer_resolution_policy (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_key        text NOT NULL,
    entity_type         geo.geo_entity_type NOT NULL DEFAULT 'address',
    preference_order    geo.consumer_id_preference[] NOT NULL,
    fallback_to_canonical boolean DEFAULT true,
    return_all_ids      boolean DEFAULT false,
    country_code        char(2),
    active              boolean DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_consumer_resolution_policy_key_type_country
        UNIQUE (consumer_key, entity_type, country_code)
);

COMMENT ON TABLE geo.consumer_resolution_policy IS
  'Defines per-consumer ID resolution rules. '
  'preference_order is a PostgreSQL array of consumer_id_preference enum values, tried left-to-right.';

CREATE TRIGGER trg_consumer_resolution_policy_updated_at
    BEFORE UPDATE ON geo.consumer_resolution_policy
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();

CREATE TABLE geo.consumer_id_resolution_cache (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_key        text NOT NULL,
    master_id           uuid NOT NULL,
    entity_type         geo.geo_entity_type NOT NULL,
    resolved_id_type    geo.consumer_id_preference NOT NULL,
    resolved_id         text NOT NULL,
    id_map              jsonb,
    resolved_at         timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,
    CONSTRAINT uq_consumer_id_cache_consumer_master
        UNIQUE (consumer_key, master_id, entity_type)
);

-- Seed default consumer policies
INSERT INTO geo.consumer_resolution_policy
    (consumer_key, entity_type, preference_order, fallback_to_canonical, return_all_ids, notes)
VALUES
    ('news_system', 'address',
     ARRAY['osm_id','geoapify_id','canonical_uuid']::geo.consumer_id_preference[],
     true, false, 'News location tagging; OSM IDs preferred for interoperability'),
    ('news_system', 'place',
     ARRAY['osm_id','geoapify_id','canonical_uuid']::geo.consumer_id_preference[],
     true, false, 'News POI tagging'),
    ('routing_api', 'address',
     ARRAY['tomtom_id','aws_id','canonical_uuid']::geo.consumer_id_preference[],
     true, false, 'Routing engine; TomTom navigable IDs preferred'),
    ('mobile_app', 'address',
     ARRAY['canonical_uuid']::geo.consumer_id_preference[],
     true, true, 'Mobile app; canonical UUIDs with full id_map for caching'),
    ('mobile_app', 'place',
     ARRAY['canonical_uuid']::geo.consumer_id_preference[],
     true, true, 'Mobile app POI lookup'),
    ('geocoder_v2', 'address',
     ARRAY['canonical_uuid','geoapify_id','osm_id','aws_id','tomtom_id']::geo.consumer_id_preference[],
     true, true, 'Geocoder service; returns full provider ID map'),
    ('etl_pipeline', 'address',
     ARRAY['canonical_uuid']::geo.consumer_id_preference[],
     true, false, 'Internal ETL processes; canonical UUIDs for stable references');
