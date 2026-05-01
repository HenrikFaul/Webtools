-- Migration: geo_canonical_02_enum_types

CREATE TYPE geo.address_coordinate_type AS ENUM (
    'rooftop',        -- GPS-level roof point
    'entrance',       -- building entrance / routing point
    'parcel',         -- parcel/lot centroid
    'interpolated',   -- street interpolation estimate
    'centroid',       -- administrative centroid
    'venue',          -- indoor / POI floor centroid
    'approximated'    -- coarse / postal centroid
);

-- Source provider vocabulary — matches existing public.unified_pois.source_provider values
CREATE TYPE geo.geo_source_provider AS ENUM (
    'aws',        -- AWS Location Service
    'geoapify',   -- Geoapify / OSM-derived
    'tomtom',     -- TomTom commercial
    'local_osm',  -- Local OSM direct import
    'manual',     -- Human-entered
    'derived'     -- Computed / synthesized
);

CREATE TYPE geo.match_status AS ENUM (
    'pending',
    'merged',
    'no_match',
    'review',
    'rejected',
    'duplicate'
);

CREATE TYPE geo.geo_entity_type AS ENUM (
    'address',
    'place',
    'street',
    'locality',
    'area',
    'poi'
);

CREATE TYPE geo.address_component_type AS ENUM (
    'country', 'country_code', 'country_code_iso3',
    'admin1', 'admin1_code', 'admin2', 'admin2_code',
    'locality', 'sub_locality', 'neighbourhood',
    'postal_code', 'street_name', 'street_type', 'street_type_normalized',
    'house_number', 'house_number_suffix', 'building_name',
    'unit_floor', 'unit_door', 'unit_staircase',
    'conscription_number', 'lot_number', 'po_box', 'landmark',
    'formatted_line1', 'formatted_line2',
    'hu_kozterulet_neve', 'hu_kozterulet_tipusa',
    'hu_kulterulet_neve', 'hu_epulet_nev', 'hu_hrsz',
    'int_dependent_thoroughfare', 'int_building_number', 'int_sub_building'
);

CREATE TYPE geo.consumer_id_preference AS ENUM (
    'canonical_uuid',
    'osm_id',
    'geoapify_id',
    'aws_id',
    'tomtom_id',
    'any_source_id'
);
