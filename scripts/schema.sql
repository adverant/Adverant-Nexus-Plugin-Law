-- Nexus Law Database Schema
-- PostgreSQL 14+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "vector"; -- For pgvector (if available)

-- Create schemas
CREATE SCHEMA IF NOT EXISTS nexus_law;
CREATE SCHEMA IF NOT EXISTS config;

-- ============================================================================
-- CONFIGURATION TABLES (Dynamic, Zero Hardcoding)
-- ============================================================================

-- Jurisdictions configuration
CREATE TABLE IF NOT EXISTS config.jurisdictions (
  id VARCHAR(10) PRIMARY KEY, -- ISO country code
  name VARCHAR(255) NOT NULL,
  legal_system VARCHAR(50) NOT NULL, -- 'common_law', 'civil_law', 'mixed', etc.

  -- Full configuration as JSONB (fully extensible)
  configuration JSONB NOT NULL DEFAULT '{}',

  -- Version control
  version INT DEFAULT 1,
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jurisdictions_active ON config.jurisdictions(active);
CREATE INDEX idx_jurisdictions_legal_system ON config.jurisdictions(legal_system);

-- Courts configuration
CREATE TABLE IF NOT EXISTS config.courts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_id VARCHAR(10) REFERENCES config.jurisdictions(id),
  court_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  level INT NOT NULL, -- 1=supreme, 2=appellate, 3=trial

  -- Binding authority (which jurisdictions are bound by this court)
  binding_authority JSONB DEFAULT '[]',

  -- Full configuration
  configuration JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(jurisdiction_id, court_code)
);

CREATE INDEX idx_courts_jurisdiction ON config.courts(jurisdiction_id);
CREATE INDEX idx_courts_level ON config.courts(level);

-- Database adapters registry
CREATE TABLE IF NOT EXISTS config.database_adapters (
  id VARCHAR(100) PRIMARY KEY, -- e.g., 'courtlistener', 'lexisnexis-us'
  name VARCHAR(255) NOT NULL,
  adapter_type VARCHAR(50) NOT NULL, -- 'commercial', 'open_source', 'government', 'academic'

  -- Supported jurisdictions
  jurisdictions JSONB NOT NULL DEFAULT '[]',

  -- Connection configuration (should be encrypted)
  configuration JSONB NOT NULL DEFAULT '{}',

  -- Cost model
  cost_model JSONB DEFAULT '{}',

  -- Status
  enabled BOOLEAN DEFAULT true,
  health_status VARCHAR(50) DEFAULT 'unknown',
  last_health_check TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adapters_type ON config.database_adapters(adapter_type);
CREATE INDEX idx_adapters_enabled ON config.database_adapters(enabled);

-- Citation formats (dynamic per jurisdiction)
CREATE TABLE IF NOT EXISTS config.citation_formats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_id VARCHAR(10) REFERENCES config.jurisdictions(id),
  format_name VARCHAR(100) NOT NULL, -- e.g., 'bluebook', 'oscola', 'aglc'
  document_type VARCHAR(100) NOT NULL, -- 'case', 'statute', 'regulation', etc.

  -- Template with placeholders (e.g., "{volume} {reporter} {page} ({court} {year})")
  template TEXT NOT NULL,

  -- Example
  example VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(jurisdiction_id, format_name, document_type)
);

-- ============================================================================
-- LEGAL ENTITIES
-- ============================================================================

-- Cases table
CREATE TABLE IF NOT EXISTS nexus_law.cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number VARCHAR(255) NOT NULL,
  case_name TEXT NOT NULL,
  court_id UUID REFERENCES config.courts(id),
  jurisdiction VARCHAR(10) NOT NULL,
  filing_date DATE,
  decision_date DATE,
  case_type VARCHAR(100),
  status VARCHAR(50),

  -- Dynamic metadata (fully configurable)
  metadata JSONB DEFAULT '{}',

  -- Full-text search
  search_vector TSVECTOR,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  CONSTRAINT valid_jurisdiction CHECK (jurisdiction ~ '^[a-z]{2}(-[a-z]{2})?$')
);

CREATE INDEX idx_cases_jurisdiction ON nexus_law.cases(jurisdiction);
CREATE INDEX idx_cases_search ON nexus_law.cases USING GIN(search_vector);
CREATE INDEX idx_cases_metadata ON nexus_law.cases USING GIN(metadata);
CREATE INDEX idx_cases_decision_date ON nexus_law.cases(decision_date);

-- Parties table
CREATE TABLE IF NOT EXISTS nexus_law.parties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  party_type VARCHAR(50) NOT NULL, -- 'plaintiff', 'defendant', 'intervenor', etc.
  entity_type VARCHAR(50), -- 'individual', 'corporation', 'government', etc.

  -- Dynamic fields
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parties_name ON nexus_law.parties USING GIN(name gin_trgm_ops);
CREATE INDEX idx_parties_type ON nexus_law.parties(party_type);

-- Case-Party relationship (many-to-many)
CREATE TABLE IF NOT EXISTS nexus_law.case_parties (
  case_id UUID REFERENCES nexus_law.cases(id) ON DELETE CASCADE,
  party_id UUID REFERENCES nexus_law.parties(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,

  PRIMARY KEY (case_id, party_id, role)
);

-- Documents table (integrates with FileProcess Document DNA)
CREATE TABLE IF NOT EXISTS nexus_law.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES nexus_law.cases(id),

  -- FileProcess Document DNA reference
  document_dna_id UUID NOT NULL,

  -- Document metadata
  document_type VARCHAR(100) NOT NULL,
  title TEXT,
  filing_date DATE,
  author VARCHAR(255),

  -- Classification
  privilege_status VARCHAR(50), -- 'privileged', 'work_product', 'none'
  confidentiality VARCHAR(50), -- 'public', 'confidential', 'highly_confidential'

  -- Dynamic fields
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_case ON nexus_law.documents(case_id);
CREATE INDEX idx_documents_dna ON nexus_law.documents(document_dna_id);
CREATE INDEX idx_documents_type ON nexus_law.documents(document_type);

-- Citations table (integrates with GraphRAG knowledge graph)
CREATE TABLE IF NOT EXISTS nexus_law.citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  citing_case_id UUID REFERENCES nexus_law.cases(id),
  cited_case_id UUID REFERENCES nexus_law.cases(id),

  citation_type VARCHAR(50), -- 'followed', 'distinguished', 'overruled', etc.
  depth INT DEFAULT 1, -- Citation depth/treatment

  -- GraphRAG integration
  graph_relationship_id VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_cases CHECK (citing_case_id != cited_case_id)
);

CREATE INDEX idx_citations_citing ON nexus_law.citations(citing_case_id);
CREATE INDEX idx_citations_cited ON nexus_law.citations(cited_case_id);
CREATE INDEX idx_citations_type ON nexus_law.citations(citation_type);

-- Statutes table
CREATE TABLE IF NOT EXISTS nexus_law.statutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction VARCHAR(10) NOT NULL,
  title VARCHAR(255),
  section VARCHAR(255) NOT NULL,
  full_text TEXT,

  effective_date DATE,
  repeal_date DATE,

  -- Dynamic fields
  metadata JSONB DEFAULT '{}',

  -- Full-text search
  search_vector TSVECTOR,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_statutes_jurisdiction ON nexus_law.statutes(jurisdiction);
CREATE INDEX idx_statutes_search ON nexus_law.statutes USING GIN(search_vector);

-- Regulations table
CREATE TABLE IF NOT EXISTS nexus_law.regulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction VARCHAR(10) NOT NULL,
  agency VARCHAR(255),
  regulation_number VARCHAR(255),
  title TEXT,
  full_text TEXT,

  effective_date DATE,

  -- Dynamic fields
  metadata JSONB DEFAULT '{}',

  search_vector TSVECTOR,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulations_jurisdiction ON nexus_law.regulations(jurisdiction);
CREATE INDEX idx_regulations_agency ON nexus_law.regulations(agency);

-- ============================================================================
-- QUERY CACHE
-- ============================================================================

-- Query cache for cost optimization
CREATE TABLE IF NOT EXISTS nexus_law.query_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of query
  query JSONB NOT NULL,
  result JSONB NOT NULL,

  -- Metadata
  total_cost DECIMAL(10,4),
  processing_time INT, -- milliseconds
  sources_used JSONB,

  -- Cache management
  hit_count INT DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_cache_hash ON nexus_law.query_cache(query_hash);
CREATE INDEX idx_query_cache_expires ON nexus_law.query_cache(expires_at);

-- ============================================================================
-- ANALYTICS & AUDITING
-- ============================================================================

-- Query logs for analytics
CREATE TABLE IF NOT EXISTS nexus_law.query_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  session_id UUID,

  query JSONB NOT NULL,
  result_count INT,
  total_cost DECIMAL(10,4),
  processing_time INT, -- milliseconds

  sources_used JSONB,
  cache_hit BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_logs_user ON nexus_law.query_logs(user_id);
CREATE INDEX idx_query_logs_created ON nexus_law.query_logs(created_at);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON nexus_law.cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON nexus_law.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update search vectors
CREATE OR REPLACE FUNCTION update_case_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.case_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.case_number, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cases_search
  BEFORE INSERT OR UPDATE ON nexus_law.cases
  FOR EACH ROW
  EXECUTE FUNCTION update_case_search_vector();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default US jurisdiction configuration
INSERT INTO config.jurisdictions (id, name, legal_system, configuration) VALUES
('us', 'United States', 'common_law', '{
  "citation_style": "bluebook",
  "court_system": "federal_state_dual"
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert SCOTUS court
INSERT INTO config.courts (jurisdiction_id, court_code, name, level, binding_authority, configuration) VALUES
('us', 'scotus', 'Supreme Court of the United States', 1, '["all"]'::jsonb, '{}'::jsonb)
ON CONFLICT (jurisdiction_id, court_code) DO NOTHING;

-- Insert CourtListener adapter configuration
INSERT INTO config.database_adapters (id, name, adapter_type, jurisdictions, configuration, cost_model, enabled) VALUES
('courtlistener', 'CourtListener (Free Law Project)', 'open_source',
 '["us", "us-*"]'::jsonb,
 '{
   "endpoint": "https://www.courtlistener.com/api/rest/v3/",
   "requires_auth": false,
   "free_tier": true
 }'::jsonb,
 '{
   "base_charge": 0.00,
   "per_result": 0.00
 }'::jsonb,
 true)
ON CONFLICT (id) DO NOTHING;

-- Insert default citation formats
INSERT INTO config.citation_formats (jurisdiction_id, format_name, document_type, template, example) VALUES
('us', 'bluebook', 'case', '{volume} {reporter} {page} ({court} {year})', '550 U.S. 544 (2007)'),
('us', 'bluebook', 'statute', '{title} U.S.C. § {section} ({year})', '42 U.S.C. § 1983 (2018)')
ON CONFLICT (jurisdiction_id, format_name, document_type) DO NOTHING;

-- ============================================================================
-- GRANTS (Adjust based on your user setup)
-- ============================================================================

-- Grant permissions to unified_brain user
GRANT USAGE ON SCHEMA nexus_law TO unified_brain;
GRANT USAGE ON SCHEMA config TO unified_brain;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA nexus_law TO unified_brain;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA config TO unified_brain;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA nexus_law TO unified_brain;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA config TO unified_brain;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Nexus Law database schema created successfully!';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Schemas: nexus_law, config';
  RAISE NOTICE 'Tables: 13 core tables + configuration';
  RAISE NOTICE 'Seed data: US jurisdiction + CourtListener adapter';
  RAISE NOTICE '=================================================';
END $$;
