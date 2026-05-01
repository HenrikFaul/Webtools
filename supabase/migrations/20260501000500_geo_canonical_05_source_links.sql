-- Migration: geo_canonical_05_source_links

CREATE TABLE geo.source_address_link (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_address_id   uuid NOT NULL REFERENCES geo.master_address(id) ON DELETE CASCADE,
    source_provider     geo.geo_source_provider NOT NULL,
    source_table        text NOT NULL,
    source_row_id       uuid,
    source_native_id    text,
    source_osm_id       bigint,
    source_osm_type     char(1),
    link_confidence     numeric(5,4) DEFAULT 1.0,
    is_primary_source   boolean DEFAULT false,
    linked_by_session   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_address_link_provider_native
        UNIQUE (source_provider, source_native_id),
    CONSTRAINT uq_source_address_link_row
        UNIQUE (source_table, source_row_id)
);

COMMENT ON TABLE geo.source_address_link IS
  'Maps provider source rows to canonical master_address. '
  'source_native_id is the provider''s own opaque ID. '
  'Multiple source rows can map to one master_address (cross-provider dedup).';

CREATE TRIGGER trg_source_address_link_updated_at
    BEFORE UPDATE ON geo.source_address_link
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();

CREATE TABLE geo.source_place_link (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_place_id     uuid NOT NULL REFERENCES geo.master_place(id) ON DELETE CASCADE,
    source_provider     geo.geo_source_provider NOT NULL,
    source_table        text NOT NULL,
    source_row_id       uuid,
    source_native_id    text,
    source_osm_id       bigint,
    source_osm_type     char(1),
    link_confidence     numeric(5,4) DEFAULT 1.0,
    is_primary_source   boolean DEFAULT false,
    linked_by_session   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_place_link_provider_native
        UNIQUE (source_provider, source_native_id),
    CONSTRAINT uq_source_place_link_row
        UNIQUE (source_table, source_row_id)
);

CREATE TRIGGER trg_source_place_link_updated_at
    BEFORE UPDATE ON geo.source_place_link
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();
