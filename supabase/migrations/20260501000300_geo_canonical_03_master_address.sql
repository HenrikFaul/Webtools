-- Migration: geo_canonical_03_master_address

CREATE TABLE geo.master_address (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merge_key               text NOT NULL,
    country_code            char(2)  NOT NULL,
    country_code_iso3       char(3),
    iso3166_2               text,
    admin1                  text,
    admin2                  text,
    postal_code             text,
    locality                text,
    sub_locality            text,
    neighbourhood           text,
    street_name             text,
    street_type             text,
    street_type_normalized  text,
    house_number            text,
    house_number_suffix     text,
    unit_floor              text,
    unit_door               text,
    unit_staircase          text,
    conscription_number     text,
    building_name           text,
    hu_hrsz                 text,
    hu_kulterulet_neve      text,
    hu_epulet_nev           text,
    formatted_address       text,
    formatted_address_hu    text,
    formatted_address_intl  text,
    is_hu_address           boolean GENERATED ALWAYS AS (country_code = 'HU') STORED,
    is_building_level       boolean DEFAULT false,
    is_rural                boolean DEFAULT false,
    is_approximate          boolean DEFAULT false,
    address_quality         smallint DEFAULT 0,
    survivorship_version    smallint DEFAULT 1,
    source_count            smallint DEFAULT 1,
    last_merge_session      uuid,
    last_merged_at          timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_master_address_merge_key UNIQUE (merge_key)
);

COMMENT ON TABLE geo.master_address IS
  'Canonical address master — one row per real-world address. '
  'Never delete; mark deprecated via address_quality=-1 and lineage_event.';

CREATE TABLE geo.master_place (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merge_key               text NOT NULL,
    name                    text NOT NULL,
    name_normalized         text,
    name_international      jsonb,
    local_name              text,
    place_type              text NOT NULL,
    categories              jsonb,
    category_set_ids        jsonb,
    primary_address_id      uuid REFERENCES geo.master_address(id) ON DELETE SET NULL,
    country_code            char(2),
    iso3166_2               text,
    postal_code             text,
    locality                text,
    osm_id                  bigint,
    osm_type                char(1),
    website                 text,
    phone                   text,
    email                   text,
    opening_hours           jsonb,
    is_active               boolean DEFAULT true,
    properties              jsonb,
    place_quality           smallint DEFAULT 0,
    survivorship_version    smallint DEFAULT 1,
    source_count            smallint DEFAULT 1,
    last_merge_session      uuid,
    last_merged_at          timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_master_place_merge_key UNIQUE (merge_key)
);

COMMENT ON TABLE geo.master_place IS
  'Canonical place/POI master — one row per real-world named place. '
  'Linked to master_address via primary_address_id.';

CREATE OR REPLACE FUNCTION geo.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_master_address_updated_at
    BEFORE UPDATE ON geo.master_address
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();

CREATE TRIGGER trg_master_place_updated_at
    BEFORE UPDATE ON geo.master_place
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();
