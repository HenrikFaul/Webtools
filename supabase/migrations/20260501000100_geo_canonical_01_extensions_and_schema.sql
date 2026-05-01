-- Migration: geo_canonical_01_extensions_and_schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create canonical geo schema
CREATE SCHEMA IF NOT EXISTS geo;

COMMENT ON SCHEMA geo IS
  'Canonical geospatial master data layer — addresses, places, geocodes, matching, search. '
  'Source provider tables remain in public schema. This schema holds the hub-and-spoke MDM layer.';
