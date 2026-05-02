-- BUGFIX: geo_canonical_fix_merge_key_null_propagation
--
-- Hiba: geo.compute_address_merge_key() NULL-t adott vissza, ha
--   p_street_type IS NULL volt, mert:
--     geo.normalize_hu_street_type(NULL) → NULL
--     lower(unaccent(NULL)) = NULL
--     NULL || '|' || ... = NULL  (PostgreSQL || string concat)
--     md5(NULL) = NULL
--     'addr:' || NULL = NULL
--   → merge_key NOT NULL constraint violation az INSERT-nél.
--
-- Gyökérok: hiányzó COALESCE(..., '') a normalize_hu_street_type hívása körül.
-- Érintett esetek: locality-only sorok (Gyál, Miskolc stb.) ahol nincs street_type.

CREATE OR REPLACE FUNCTION geo.compute_address_merge_key(
    p_country_code  text,
    p_postal_code   text,
    p_locality      text,
    p_street_name   text,
    p_street_type   text,
    p_house_number  text,
    p_unit_floor    text DEFAULT NULL,
    p_unit_door     text DEFAULT NULL
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
SELECT 'addr:' || md5(
    lower(coalesce(p_country_code, ''))
    || '|' ||
    lower(coalesce(p_postal_code, ''))
    || '|' ||
    lower(geo.immutable_unaccent(coalesce(p_locality, '')))
    || '|' ||
    lower(geo.immutable_unaccent(coalesce(p_street_name, '')))
    || '|' ||
    -- FIX: coalesce kötelező, mert normalize_hu_street_type(NULL) = NULL
    lower(geo.immutable_unaccent(coalesce(geo.normalize_hu_street_type(p_street_type), '')))
    || '|' ||
    lower(coalesce(regexp_replace(p_house_number, '\s+', '', 'g'), ''))
    || '|' ||
    lower(coalesce(p_unit_floor, ''))
    || '|' ||
    lower(coalesce(p_unit_door, ''))
)
$$;

CREATE OR REPLACE FUNCTION geo.compute_place_merge_key(
    p_country_code  text,
    p_locality      text,
    p_name          text,
    p_place_type    text,
    p_osm_id        bigint DEFAULT NULL
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
SELECT 'place:' || CASE
    WHEN p_osm_id IS NOT NULL THEN
        md5(lower(coalesce(p_country_code, '')) || '|osm:' || p_osm_id::text)
    ELSE
        md5(
            lower(coalesce(p_country_code, ''))
            || '|' ||
            lower(geo.immutable_unaccent(coalesce(p_locality, '')))
            || '|' ||
            lower(geo.immutable_unaccent(coalesce(p_name, '')))
            || '|' ||
            lower(coalesce(p_place_type, ''))
        )
END
$$;

-- normalize_hu_street_type: volatility STABLE (tábla lookup), nem IMMUTABLE.
-- A hívó oldalon (compute_address_merge_key) kötelező a COALESCE.
CREATE OR REPLACE FUNCTION geo.normalize_hu_street_type(p_raw text)
RETURNS text
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
    v_clean  text;
    v_result text;
BEGIN
    IF p_raw IS NULL OR trim(p_raw) = '' THEN RETURN NULL; END IF;

    v_clean := lower(trim(public.unaccent(p_raw)));

    SELECT canonical INTO v_result
    FROM geo.hu_kozterulet_type_map
    WHERE raw_form = v_clean;

    IF v_result IS NOT NULL THEN RETURN v_result; END IF;

    v_clean := lower(trim(p_raw));
    SELECT canonical INTO v_result
    FROM geo.hu_kozterulet_type_map
    WHERE raw_form = v_clean;

    RETURN coalesce(v_result, lower(trim(p_raw)));
END;
$$;
