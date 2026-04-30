# Master Address Architecture (OSM-Canonical, Multi-Provider)

## 1. System Understanding Summary
- Current schema has one rich address foundation table: `public.osm_addresses` (OSM address-level corpus with decomposition + lat/lon + raw tags/features).  
- Provider source tables are POI-centric, not pure postal-address tables: `public.geoapify_pois`, `public.tomtom_pois`, `public.aws_pois`.  
- Existing `unified_pois`/`local_pois` are provider harmonization targets for POIs, but they do **not** provide a canonical, one-address-per-real-world-address MDM layer.
- Therefore, the target architecture must add a dedicated canonical-address layer seeded from OSM and link provider rows through explainable match decisions.

## 2. Address Source Inventory
### Core canonical seed
- `public.osm_addresses`: OSM identity (`osm_type`,`osm_id`,`external_id`), hierarchical admin fields, street decomposition, house-level tokens, coordinates, raw lineage (`raw_tags`,`raw_feature`,`source_file`,`import_session_id`).

### Provider source tables
- `public.geoapify_pois`: POI + address attributes (`street`,`housenumber`,`postcode`,`city`,`district`,`suburb`,`formatted_address`, lat/lon), plus POI metadata and possible OSM references (`osm_id`,`osm_type`).
- `public.tomtom_pois`: POI + address attributes (`street_number`,`street_name`,`postal_code`,`municipality`,`country_subdivision*`,`freeform_address`, lat/lon), plus quality signals (`score`,`dist`) and POI metadata.
- `public.aws_pois`: POI + address attributes (`street`,`street_number`,`postal_code`,`city`,`district`,`state_region`,`sub_region_*`,`formatted_address`, lat/lon), plus provider payload fields.

### Supporting but non-canonical
- `public.unified_pois`, `public.local_pois`: integration/read models for POIs; useful as migration aides but not the canonical address system.

## 3. Provider Table and Column Mapping
### Table-to-provider mapping
- OSM provider: `osm_addresses`.
- Geoapify provider: `geoapify_pois`.
- TomTom provider: `tomtom_pois`.
- AWS Location provider: `aws_pois`.

### Provider ID candidates
- OSM: `external_id` (`osm_type:osm_id` or backfilled variant), `osm_id`, `osm_type`.
- Geoapify: `external_id` (provider ID), optional `osm_id`/`osm_type` as cross-reference.
- TomTom: `external_id`.
- AWS: `external_id` (explicit unique constraint).

### Address decomposition candidates
- House number: `osm_addresses.housenumber|house_number`; `geoapify_pois.housenumber`; `tomtom_pois.street_number`; `aws_pois.street_number`.
- Street: `osm_addresses.street|street_name`; `geoapify_pois.street`; `tomtom_pois.street_name`; `aws_pois.street`.
- Postal: `osm_addresses.postcode`; `geoapify_pois.postcode`; `tomtom_pois.postal_code`; `aws_pois.postal_code`.
- Locality/admin: OSM has richest hierarchy (`city/town/village/...` + `district/county/state/country_code`), others use provider-specific variants.
- Formatted address: `osm_addresses.display_name`, `geoapify_pois.formatted_address`, `tomtom_pois.freeform_address`, `aws_pois.formatted_address`.
- Coordinates: `lat/lon` across all four tables.
- Place/venue metadata: rich on POI tables (`categories`, contacts, opening hours, brand/operator, etc.).
- Timestamps/lineage: OSM (`imported_at`,`updated_at`,`import_session_id`), Geoapify/TomTom (`fetched_at`), AWS (`fetched_at`,`created_at`,`updated_at`).
- Ranking/confidence signals: TomTom `score`,`dist`; others mostly absent.

### Gaps and risks
- No explicit geometry column (only lat/lon). Add generated geography/geometry in master layer.
- OSM migration inconsistency (`external_id` format appears as `osm_type:osm_id` vs backfill `osm_type/osm_id`) requires normalization policy.
- Provider tables are POI-oriented; many records may represent venue centroids with weak structured addresses.
- No current persistent match/audit/review model for cross-provider address identity.

## 4. Canonical Address Design
Canonical address = one real-world mailable/addressable location entity, independent of provider payloads.

### Canonical seed rationale
- OSM has largest coverage and richest decomposition, plus explicit object identity and raw lineage.

### Canonical tables
1. `address.canonical_address`
2. `address.canonical_address_component` (optional split table if high normalization granularity required)
3. `address.canonical_address_lineage` (source provenance)

### Proposed columns (core)
- `canonical_address_id` UUID PK.
- `osm_external_id` text unique nullable (for seed lineage).
- `display_address` text.
- `house_number_norm`, `house_number_suffix_norm`, `street_name_norm`, `street_type_norm`, `unit_norm`, `floor_norm`, `door_norm`, `staircase_norm`.
- `postal_code_norm`, `locality_norm`, `district_norm`, `county_norm`, `region_norm`, `country_code_iso2`.
- `lat`, `lon`, `geog geography(Point,4326)` generated or maintained.
- `geohash_8` text.
- `quality_grade` enum (`A`,`B`,`C`,`D`), `completeness_score` numeric.
- `canonicalization_version` int.
- `status` enum (`active`,`deprecated`,`needs_review`).
- `created_at`,`updated_at`,`created_by`,`updated_by`.

### Minimum required components
- country_code + locality + street + house_number **or** high-precision geospatial surrogate in sparse regions.

### Optional preserved components
- all extra OSM decomposition fields, interpolation markers, building/block/entrance metadata.

## 5. Recommended Relational Model
Choose **C**: canonical table + provider registry + provider entity link + optional typed extensions.

### Why C
- Avoids nullable-column explosion (problem in model A).
- Supports N providers without schema redesign (better than B long-term).
- Supports multiplicity (one canonical address to many provider entities when legitimate).

### DDL-level model
- `address.provider_registry(provider_id PK, provider_code unique, entity_kind, active_flag, config_json)`.
- `address.provider_source_record(provider_record_id PK, provider_id FK, source_table, provider_native_id, source_pk_text, raw_payload jsonb, source_fetched_at, source_hash, unique(provider_id, provider_native_id))`.
- `address.canonical_address` (above).
- `address.canonical_provider_link(link_id PK, canonical_address_id FK, provider_record_id FK, match_status, confidence_band, confidence_score, link_type, is_primary_for_provider, decision_source, manual_override_flag, valid_from, valid_to, unique(canonical_address_id, provider_record_id)).`
- `address.match_run(run_id PK, provider_id FK, ruleset_version, started_at, completed_at, metrics_json)`.
- `address.match_evidence(evidence_id PK, link_id FK nullable, run_id FK, evidence_type, evidence_value jsonb, weight, contributed_score)`.
- `address.review_queue(review_id PK, provider_record_id FK, candidate_set jsonb, reason_code, status, assigned_to, decision, decided_at, decision_notes)`.
- `address.review_audit(audit_id PK, review_id FK, action, old_value jsonb, new_value jsonb, actor, acted_at)`.

## 6. Matching and Nomination Pipeline
1. Ingest provider row snapshot into `provider_source_record` (idempotent hash check).  
2. Normalize raw strings (casefold, trim, punctuation, diacritics, locale rules).  
3. Parse decomposition (house number/suffix/unit/street type).  
4. Normalize geo (validate ranges; round precision variants).  
5. Build deterministic keys (`country|postal|street_norm|house_norm`).  
6. Exact lookup on canonical keys.  
7. Narrow candidates by country+locality+postal, then geospatial window.  
8. Score candidates (structured agreement + geo distance + formatted similarity penalties/bonuses).  
9. Threshold: auto-link exact/high only; medium->review queue; low->unresolved.  
10. Persist link + evidence + run metrics.  
11. Reprocessing: rerun by provider/ruleset, supersede prior decisions with valid-time closure.

Failure handling: ambiguous candidates never auto-merged; unresolved preserved as first-class state.

## 7. Match Confidence Framework
Bands:
- `exact` (deterministic key + locality/postal/country consistent, minimal geo delta).
- `high` (strong structured agreement + close geo).
- `medium` (partial structure; plausible geo/text; requires review).
- `low` (weak support; keep unmatched).
- `rejected` (explicitly denied).
- `unresolved` (no safe candidate).

Signals/weights (example):
- house number exact +25, normalized street exact +25, postal +15, locality +10, country +10, geo distance +15, formatted similarity +5.
- penalties: postal mismatch -20, locality mismatch -20, country mismatch hard reject.
- venue name similarity: max +3 booster only, never decisive.

Auto-link policy:
- exact/high with no conflicting high candidate.
- otherwise review queue.

## 8. Manual Review and Ambiguity Handling
### Review queue schema essentials
- Candidate list with ranked scores, reason codes (`MULTI_HIGH_CANDIDATES`, `POSTAL_CONFLICT`, `MISSING_HOUSE_NUMBER`, `GEO_OUTLIER`, etc.).

### Reviewer actions
- approve link to candidate.
- reject all (remain unmatched).
- create new canonical address (if truly missing from OSM universe and policy permits controlled expansion).
- split/merge remediation ticket for suspected canonical duplicate clusters.

All decisions write immutable audit events and trigger replayable rematch transitions.

## 9. Downstream Consumption Model
Read models/views:
- `address.master_address` (canonical current active records).
- `address.master_address_provider_link` (current valid links + confidence).
- `address.master_address_best_provider_by_usecase` (rules-driven routing).
- `address.unresolved_provider_addresses`.
- `address.ambiguous_matches`.
- `address.canonical_address_quality_view`.

Routing examples:
- Venue enrichment: prefer provider with richer category/opening-hours coverage by geography.
- Residential strict lookup: prefer OSM canonical + exact/high confidence links only.
- Real-time detail API: choose provider with live endpoint availability; fallback by ranked provider preference.

## 10. Extensibility Strategy for New Providers
1. Add row to `provider_registry`.
2. Implement provider adapter contract:
   - extract provider native ID,
   - map raw fields to standard normalization input,
   - provide source fetched timestamp + raw payload.
3. Configure mapping/rules in `config_json` or dedicated `provider_field_mapping` table.
4. Run same pipeline; no core schema change.
5. Publish compatibility view updates with additive semantics.

## 11. Data Integrity and Maintainability Design
### Risk matrix (summary)
- False merge risk → conservative thresholds + manual review.
- Duplicate canonical risk → duplicate detection job on canonical table.
- Orphan link risk → strict FKs + deferred constraints in batch txns.
- Replay drift risk → versioned rulesets + run tracking.

### Reconciliation
- Daily provider-vs-link completeness checks.
- Unmatched rate and ambiguity rate monitoring.
- Provider ID uniqueness and source hash collision checks.

### Reprocessing
- Idempotent upsert by `(provider_id, provider_native_id)`.
- Versioned normalization/matching rules; rematch by delta scope.
- Maintain history via `valid_from/valid_to` on links.

### Operations checklist
- constraint validation, index health, queue backlog SLA, drift metrics, audit log growth, archival policy.

## 12. Migration and Backfill Plan
1. Create new `address` schema + registry + canonical + link + run/evidence/review tables.
2. Backfill canonical from `osm_addresses` (normalized projection; retain OSM lineage).
3. Backfill `provider_source_record` from geoapify/tomtom/aws tables.
4. Run matcher in dry-run mode; populate evidence + candidate scores only.
5. Enable auto-link for exact/high; queue medium.
6. Review and resolve queue in waves.
7. Cut over consumers to views; deprecate direct source coupling.

## 13. Indexing and Performance Recommendations
- Canonical lookup composite btree: `(country_code_iso2, postal_code_norm, locality_norm, street_name_norm, house_number_norm)`.
- Geo index: GIST on `geog`.
- Provider lookup: unique `(provider_id, provider_native_id)`.
- Link traversal indexes:
  - `(canonical_address_id, provider_record_id)` unique,
  - `(provider_record_id, match_status, confidence_band)`,
  - partial index for `status='active'`.
- Review queue ops index on `(status, reason_code, created_at)`.

## 14. Test Strategy
- Unit tests: normalization/parsing per locale/provider.
- Deterministic matcher golden cases.
- Property tests for idempotency.
- Integration tests: ingest→match→review→replay lifecycle.
- Data quality tests: no orphan links, uniqueness holds, confidence distribution sanity.
- Backfill validation: sampled manual adjudication, precision/recall estimates.

## 15. Operational Risks and Mitigations
- Risk: OSM missing addresses for some POIs. Mitigation: controlled non-OSM canonical candidate creation with explicit provenance and review.
- Risk: provider schema drift. Mitigation: adapter contract + schema drift alerts.
- Risk: over-automation. Mitigation: conservative auto-link threshold + audit-first design.

## 16. Open Questions / Missing Schema Details
- No explicit geometry columns or SRID constraints in source tables.
- No sample data distributions provided (null rates, country mix, coordinate precision).
- No existing business routing rules by use case/provider priority.
- OSM external ID format inconsistency across migrations requires one canonical normalization rule.

## 17. Final Recommended Architecture
Implement an OSM-seeded canonical address domain (`address.canonical_address`) with provider-agnostic source ingestion (`provider_source_record`) and explainable match links (`canonical_provider_link`) backed by run/evidence/review subsystems. Keep provider provenance immutable, never force ambiguous merges, and expose stable consumer read views so downstream systems query one trustworthy master directory while provider-specific identity and enrichment routing remain first-class and extensible.
