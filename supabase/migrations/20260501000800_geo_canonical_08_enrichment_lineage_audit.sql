-- Migration: geo_canonical_08_enrichment_lineage_audit

CREATE TABLE geo.enrichment_event (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type             geo.geo_entity_type NOT NULL,
    master_id               uuid NOT NULL,
    event_type              text NOT NULL,
    priority                smallint DEFAULT 5,
    payload                 jsonb,
    status                  text NOT NULL DEFAULT 'queued',
    attempts                smallint DEFAULT 0,
    max_attempts            smallint DEFAULT 3,
    last_error              text,
    queued_at               timestamptz NOT NULL DEFAULT now(),
    processing_started_at   timestamptz,
    processed_at            timestamptz,
    processing_session      uuid,
    CONSTRAINT chk_enrichment_status
        CHECK (status IN ('queued','processing','done','failed','cancelled')),
    CONSTRAINT chk_enrichment_priority
        CHECK (priority BETWEEN 1 AND 10)
);

COMMENT ON TABLE geo.enrichment_event IS
  'Async enrichment work queue. '
  'Workers claim rows with FOR UPDATE SKIP LOCKED on status=''queued'' ordered by (priority, queued_at). '
  'Idempotent: same (entity_type, master_id, event_type) can be re-queued safely.';

CREATE TABLE geo.lineage_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     geo.geo_entity_type NOT NULL,
    master_id       uuid NOT NULL,
    event_type      text NOT NULL,
    source_provider geo.geo_source_provider,
    merge_session   uuid,
    before_state    jsonb,
    after_state     jsonb,
    detail          jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text DEFAULT 'system'
);

COMMENT ON TABLE geo.lineage_event IS
  'Immutable lineage log for all canonical entity lifecycle events. '
  'Never updated or deleted. Enables full audit trail and rollback analysis.';

CREATE INDEX idx_lineage_event_master  ON geo.lineage_event (master_id, created_at DESC);
CREATE INDEX idx_lineage_event_session ON geo.lineage_event (merge_session) WHERE merge_session IS NOT NULL;
CREATE INDEX idx_lineage_event_type    ON geo.lineage_event (event_type, entity_type, created_at DESC);

CREATE TABLE geo.audit_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_name     text NOT NULL DEFAULT 'geo',
    table_name      text NOT NULL,
    row_id          uuid NOT NULL,
    operation       text NOT NULL,
    old_data        jsonb,
    new_data        jsonb,
    changed_fields  text[],
    changed_by      text,
    changed_at      timestamptz NOT NULL DEFAULT now(),
    session_id      uuid,
    app_context     jsonb
);

COMMENT ON TABLE geo.audit_event IS
  'Full audit log for canonical geo schema tables. '
  'Populated by row-level triggers on master_address, master_place, source_address_link, source_place_link.';

CREATE INDEX idx_audit_event_table_row ON geo.audit_event (table_name, row_id, changed_at DESC);
CREATE INDEX idx_audit_event_session   ON geo.audit_event (session_id) WHERE session_id IS NOT NULL;
