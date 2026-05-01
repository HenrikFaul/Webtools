-- Migration: geo_canonical_06_match_engine_tables

CREATE TABLE geo.match_candidate (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type             geo.geo_entity_type NOT NULL,
    candidate_a_row_id      uuid NOT NULL,
    candidate_a_provider    geo.geo_source_provider NOT NULL,
    candidate_a_native_id   text,
    candidate_b_row_id      uuid NOT NULL,
    candidate_b_provider    geo.geo_source_provider NOT NULL,
    candidate_b_native_id   text,
    score_total             numeric(5,4) NOT NULL,
    score_text              numeric(5,4),
    score_geo               numeric(5,4),
    score_admin             numeric(5,4),
    score_postal            numeric(5,4),
    score_number            numeric(5,4),
    merge_session           uuid NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_match_candidate_pair_session
        UNIQUE (candidate_a_row_id, candidate_b_row_id, merge_session),
    CONSTRAINT chk_match_candidate_ordering
        CHECK (candidate_a_row_id < candidate_b_row_id)
);

COMMENT ON TABLE geo.match_candidate IS
  'Candidate matching pairs generated during entity resolution blocking pass. '
  'score_total >= 0.85 → auto-merge, 0.60–0.85 → review, < 0.60 → no-match. '
  'score_total = text*0.40 + geo*0.35 + admin*0.15 + number*0.10.';

CREATE TABLE geo.match_decision (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type             geo.geo_entity_type NOT NULL,
    status                  geo.match_status NOT NULL DEFAULT 'pending',
    master_id               uuid,
    candidate_row_ids       uuid[]  NOT NULL,
    candidate_providers     text[]  NOT NULL,
    candidate_native_ids    text[]  NOT NULL,
    score_total             numeric(5,4),
    survivorship_version    smallint DEFAULT 1,
    decision_detail         jsonb,
    block_reason            text,
    merge_session           uuid NOT NULL,
    decided_at              timestamptz,
    decided_by              text DEFAULT 'system',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE geo.match_decision IS
  'Final decisions from entity resolution. '
  'decision_detail.winner_fields records which provider won survivorship per field.';

CREATE TRIGGER trg_match_decision_updated_at
    BEFORE UPDATE ON geo.match_decision
    FOR EACH ROW EXECUTE FUNCTION geo.touch_updated_at();
