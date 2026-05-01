-- Migration: geo_canonical_04_geocode_and_components

CREATE TABLE geo.address_geocode (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_address_id   uuid NOT NULL REFERENCES geo.master_address(id) ON DELETE CASCADE,
    coordinate_type     geo.address_coordinate_type NOT NULL,
    geom                geometry(Point, 4326) NOT NULL,
    accuracy_meters     numeric(10,2),
    source_provider     geo.geo_source_provider NOT NULL,
    confidence          numeric(5,4) DEFAULT 1.0,
    is_primary          boolean DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_address_geocode_type_provider
        UNIQUE (master_address_id, coordinate_type, source_provider)
);

COMMENT ON TABLE geo.address_geocode IS
  'Geocode coordinates per address per coordinate precision type. '
  'Exactly one row per (master_address_id, coordinate_type, source_provider). '
  'is_primary=true marks the best available geocode for display/routing.';

CREATE TRIGGER trg_address_geocode_updated_at
    BEFORE UPDATE ON geo.address_geocode
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();

CREATE TABLE geo.place_geocode (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_place_id     uuid NOT NULL REFERENCES geo.master_place(id) ON DELETE CASCADE,
    coordinate_type     geo.address_coordinate_type NOT NULL,
    geom                geometry(Point, 4326) NOT NULL,
    accuracy_meters     numeric(10,2),
    source_provider     geo.geo_source_provider NOT NULL,
    confidence          numeric(5,4) DEFAULT 1.0,
    is_primary          boolean DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_place_geocode_type_provider
        UNIQUE (master_place_id, coordinate_type, source_provider)
);

CREATE TRIGGER trg_place_geocode_updated_at
    BEFORE UPDATE ON geo.place_geocode
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();

CREATE TABLE geo.address_component (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_address_id   uuid NOT NULL REFERENCES geo.master_address(id) ON DELETE CASCADE,
    component_type      geo.address_component_type NOT NULL,
    value               text NOT NULL,
    lang                char(2) DEFAULT 'hu',
    is_preferred        boolean DEFAULT true,
    source_provider     geo.geo_source_provider,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_address_component_type_lang
        UNIQUE (master_address_id, component_type, lang)
);

COMMENT ON TABLE geo.address_component IS
  'Structured address decomposition in EAV form. '
  'Covers both standard fields and HU-specific fields (hu_kozterulet_neve, hu_hrsz, etc.).';

CREATE TABLE geo.address_alias (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_address_id   uuid NOT NULL REFERENCES geo.master_address(id) ON DELETE CASCADE,
    alias_text          text NOT NULL,
    alias_type          text NOT NULL,
    lang                char(2),
    source_provider     geo.geo_source_provider,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geo.place_alias (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_place_id     uuid NOT NULL REFERENCES geo.master_place(id) ON DELETE CASCADE,
    alias_text          text NOT NULL,
    alias_type          text NOT NULL,
    lang                char(2),
    source_provider     geo.geo_source_provider,
    created_at          timestamptz NOT NULL DEFAULT now()
);
