-- Import System Schema for SporzaPlanner
-- Run after main schema is applied

-- =============================================================================
-- CANONICAL ENTITIES (must come first due to FKs)
-- =============================================================================

CREATE TABLE canonical_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_name TEXT NOT NULL,
  country_code TEXT,
  sport_id INTEGER REFERENCES sports(id),
  logo_url TEXT,
  primary_source_id UUID,  -- References import_sources, added later
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sport_id, primary_name)
);

CREATE TABLE canonical_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_name TEXT NOT NULL,
  sport_id INTEGER NOT NULL REFERENCES sports(id),
  country_code TEXT,
  logo_url TEXT,
  primary_source_id UUID,  -- References import_sources, added later
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sport_id, primary_name)
);

CREATE TABLE canonical_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_name TEXT NOT NULL,
  city TEXT,
  country_code TEXT,
  capacity INTEGER,
  primary_source_id UUID,  -- References import_sources, added later
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(primary_name, city)
);

-- =============================================================================
-- IMPORT SOURCES
-- =============================================================================

CREATE TABLE import_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,  -- football_data, the_sports_db, api_football, statsbomb_open
  name TEXT NOT NULL,
  kind TEXT NOT NULL,  -- api, file
  priority INTEGER NOT NULL DEFAULT 100,  -- Lower = higher priority
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSONB NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER,
  rate_limit_per_day INTEGER,
  last_fetch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FKs to canonical tables
ALTER TABLE canonical_teams ADD COLUMN primary_source_id UUID REFERENCES import_sources(id);
ALTER TABLE canonical_competitions ADD COLUMN primary_source_id UUID REFERENCES import_sources(id);
ALTER TABLE canonical_venues ADD COLUMN primary_source_id UUID REFERENCES import_sources(id);

-- =============================================================================
-- IMPORT JOBS
-- =============================================================================

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id),
  entity_scope TEXT NOT NULL,  -- competitions, fixtures, teams, events
  mode TEXT NOT NULL,  -- full, incremental, backfill
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, running, completed, failed, partial
  idempotency_key TEXT UNIQUE,
  cursor TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  stats_json JSONB NOT NULL DEFAULT '{}',
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- IMPORT RECORDS (raw + normalized)
-- =============================================================================

CREATE TABLE import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES import_jobs(id),
  source_id UUID NOT NULL REFERENCES import_sources(id),
  source_record_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  entity_type TEXT NOT NULL,  -- sport, competition, team, venue, event
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  normalized_json JSONB,
  normalized_hash TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',  -- pending, valid, invalid, quarantined
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_job_id UUID REFERENCES import_jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, source_record_id, entity_type)
);

-- =============================================================================
-- IMPORT SOURCE LINKS (entity resolution)
-- =============================================================================

CREATE TABLE import_source_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id),
  source_record_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- event, team, competition, venue
  entity_id UUID NOT NULL,  -- Links to events.id, canonical_teams.id, etc.
  confidence NUMERIC(5,2) NOT NULL,
  match_method TEXT NOT NULL,  -- exact, fingerprint, fuzzy, manual
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, source_record_id, entity_type)
);

-- =============================================================================
-- MERGE CANDIDATES (review queue)
-- =============================================================================

CREATE TABLE merge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_record_id UUID NOT NULL REFERENCES import_records(id),
  entity_type TEXT NOT NULL,
  suggested_entity_id UUID,  -- Links to canonical entity
  confidence NUMERIC(5,2) NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved_merge, create_new, ignored
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- FIELD PROVENANCE (audit trail)
-- =============================================================================

CREATE TABLE field_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- event, team, competition
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES import_sources(id),
  source_record_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, field_name)
);

-- =============================================================================
-- ALIASES
-- =============================================================================

CREATE TABLE team_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_team_id UUID NOT NULL REFERENCES canonical_teams(id),
  source_id UUID REFERENCES import_sources(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,  -- Lowercase, stripped
  UNIQUE(source_id, normalized_alias)
);

CREATE TABLE competition_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_competition_id UUID NOT NULL REFERENCES canonical_competitions(id),
  source_id UUID REFERENCES import_sources(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  UNIQUE(source_id, normalized_alias)
);

CREATE TABLE venue_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_venue_id UUID NOT NULL REFERENCES canonical_venues(id),
  source_id UUID REFERENCES import_sources(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  UNIQUE(source_id, normalized_alias)
);

-- =============================================================================
-- DEAD LETTER QUEUE
-- =============================================================================

CREATE TABLE import_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES import_jobs(id),
  source_id UUID NOT NULL REFERENCES import_sources(id),
  source_record_id TEXT,
  raw_payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_type TEXT NOT NULL,  -- network, parse, validation, rate_limit, auth
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- RATE LIMIT TRACKING
-- =============================================================================

CREATE TABLE import_rate_limits (
  source_id UUID REFERENCES import_sources(id) PRIMARY KEY,
  requests_this_minute INTEGER NOT NULL DEFAULT 0,
  requests_this_day INTEGER NOT NULL DEFAULT 0,
  minute_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_request_at TIMESTAMPTZ
);

-- =============================================================================
-- SYNC HISTORY (for manual sync UI)
-- =============================================================================

CREATE TABLE sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- events, competitions, teams
  entity_id UUID,  -- NULL for bulk syncs
  source_code TEXT NOT NULL,
  sync_type TEXT NOT NULL,  -- manual, scheduled
  triggered_by TEXT,  -- user email or 'system'
  status TEXT NOT NULL,  -- success, failed, partial
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES (critical for performance)
-- =============================================================================

-- Import records
CREATE INDEX idx_import_records_job ON import_records(job_id);
CREATE INDEX idx_import_records_validation ON import_records(validation_status) WHERE validation_status = 'pending';
CREATE INDEX idx_import_records_entity ON import_records(entity_type, source_id);

-- Source links
CREATE INDEX idx_source_links_entity ON import_source_links(entity_type, entity_id);
CREATE INDEX idx_source_links_match ON import_source_links(entity_type, entity_id, confidence DESC);
CREATE INDEX idx_source_links_source ON import_source_links(source_id, source_record_id);

-- Merge candidates
CREATE INDEX idx_merge_candidates_pending ON merge_candidates(entity_type, status) WHERE status = 'pending';
CREATE INDEX idx_merge_candidates_record ON merge_candidates(import_record_id);

-- Field provenance
CREATE INDEX idx_provenance_entity ON field_provenance(entity_type, entity_id);

-- Dead letters
CREATE INDEX idx_dead_letters_retry ON import_dead_letters(next_retry_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_dead_letters_source ON import_dead_letters(source_id, error_type);

-- Aliases (for fast lookup)
CREATE INDEX idx_team_aliases_search ON team_aliases(normalized_alias);
CREATE INDEX idx_competition_aliases_search ON competition_aliases(normalized_alias);
CREATE INDEX idx_venue_aliases_search ON venue_aliases(normalized_alias);

-- Events fingerprint (for deduplication)
CREATE INDEX idx_events_fingerprint ON events(sport_id, competition_id, DATE(startDateBE));

-- =============================================================================
-- VIEWS FOR METRICS
-- =============================================================================

CREATE VIEW import_metrics AS
SELECT 
  s.code AS source_code,
  s.name AS source_name,
  s.is_enabled,
  COUNT(DISTINCT j.id) FILTER (WHERE j.created_at > NOW() - INTERVAL '24 hours') AS jobs_24h,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed' AND j.created_at > NOW() - INTERVAL '24 hours') AS successful_jobs_24h,
  COUNT(DISTINCT r.id) FILTER (WHERE r.created_at > NOW() - INTERVAL '24 hours') AS records_24h,
  COUNT(DISTINCT r.id) FILTER (WHERE r.validation_status = 'invalid') AS invalid_records,
  COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'pending') AS pending_reviews,
  COUNT(DISTINCT dl.id) FILTER (WHERE dl.resolved_at IS NULL) AS dead_letters,
  s.last_fetch_at
FROM import_sources s
LEFT JOIN import_jobs j ON j.source_id = s.id
LEFT JOIN import_records r ON r.source_id = s.id
LEFT JOIN merge_candidates mc ON mc.import_record_id = r.id
LEFT JOIN import_dead_letters dl ON dl.source_id = s.id
GROUP BY s.id, s.code, s.name, s.is_enabled, s.last_fetch_at;

CREATE VIEW deduplication_metrics AS
SELECT 
  DATE(created_at) AS date,
  entity_type,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM import_source_links l WHERE l.source_record_id = import_records.source_record_id
  )) AS matched_records,
  COUNT(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM import_source_links l WHERE l.source_record_id = import_records.source_record_id
  )) AS unmatched_records,
  ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM import_source_links l WHERE l.source_record_id = import_records.source_record_id
  )) / NULLIF(COUNT(*), 0), 2) AS match_rate
FROM import_records
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), entity_type
ORDER BY date DESC, entity_type;

-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT INTO import_sources (code, name, kind, priority, is_enabled, rate_limit_per_minute, rate_limit_per_day, config_json) VALUES
  ('football_data', 'football-data.org', 'api', 10, true, 10, 500, '{"api_key": "", "base_url": "https://api.football-data.org/v4"}'),
  ('the_sports_db', 'TheSportsDB', 'api', 20, true, 60, 86400, '{"api_key": "", "base_url": "https://www.thesportsdb.com/api/v1/json"}'),
  ('api_football', 'API-Football', 'api', 15, true, 30, 100, '{"api_key": "", "base_url": "https://api-football-v1.p.rapidapi.com/v3"}'),
  ('statsbomb_open', 'StatsBomb Open Data', 'file', 30, false, NULL, NULL, '{"data_path": "", "enabled": false}');
