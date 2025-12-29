/**
 * Nexus Law - Database Seed Data
 *
 * Initial data for development and testing
 */

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================

INSERT INTO config.organizations (id, name, active, created_at) VALUES
  (uuid_generate_v4(), 'Demo Law Firm', true, NOW()),
  (uuid_generate_v4(), 'Acme Legal Services', true, NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- JURISDICTIONS
-- =============================================================================

-- United States (Federal)
INSERT INTO config.jurisdictions (id, name, legal_system, configuration, version, active) VALUES
  ('us', 'United States (Federal)', 'common_law', '{
    "courts": [
      {"id": "scotus", "name": "Supreme Court", "level": 1},
      {"id": "circuit", "name": "Courts of Appeals", "level": 2},
      {"id": "district", "name": "District Courts", "level": 3}
    ],
    "citationFormats": {
      "bluebook": "{{volume}} U.S. {{page}} ({{year}})"
    }
  }'::jsonb, 1, true)
ON CONFLICT (id) DO NOTHING;

-- California
INSERT INTO config.jurisdictions (id, name, legal_system, configuration, version, active) VALUES
  ('us-ca', 'California', 'common_law', '{
    "courts": [
      {"id": "ca-supreme", "name": "California Supreme Court", "level": 1},
      {"id": "ca-appeal", "name": "California Courts of Appeal", "level": 2},
      {"id": "ca-superior", "name": "California Superior Courts", "level": 3}
    ],
    "citationFormats": {
      "bluebook": "{{volume}} Cal. {{reporter}} {{page}} ({{year}})"
    }
  }'::jsonb, 1, true)
ON CONFLICT (id) DO NOTHING;

-- New York
INSERT INTO config.jurisdictions (id, name, legal_system, configuration, version, active) VALUES
  ('us-ny', 'New York', 'common_law', '{
    "courts": [
      {"id": "ny-appeal", "name": "New York Court of Appeals", "level": 1},
      {"id": "ny-supreme", "name": "New York Supreme Court", "level": 2}
    ],
    "citationFormats": {
      "bluebook": "{{volume}} N.Y. {{reporter}} {{page}} ({{year}})"
    }
  }'::jsonb, 1, true)
ON CONFLICT (id) DO NOTHING;

-- Texas
INSERT INTO config.jurisdictions (id, name, legal_system, configuration, version, active) VALUES
  ('us-tx', 'Texas', 'common_law', '{
    "courts": [
      {"id": "tx-supreme", "name": "Texas Supreme Court", "level": 1},
      {"id": "tx-crim-appeal", "name": "Texas Court of Criminal Appeals", "level": 1},
      {"id": "tx-appeal", "name": "Texas Courts of Appeals", "level": 2},
      {"id": "tx-district", "name": "Texas District Courts", "level": 3}
    ]
  }'::jsonb, 1, true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- DATABASE ADAPTERS
-- =============================================================================

-- CourtListener (Free, Open Source)
INSERT INTO config.database_adapters (
  id, name, adapter_type, jurisdictions, configuration, cost_model, enabled
) VALUES (
  'courtlistener',
  'CourtListener (Free Law Project)',
  'open_source',
  '["us", "us-*"]'::jsonb,
  '{
    "endpoint": "https://www.courtlistener.com/api/rest/v3/",
    "requiresAuth": false,
    "rateLimit": {"requests": 5000, "period": "hour"}
  }'::jsonb,
  '{
    "baseCharge": 0.00,
    "perResult": 0.00,
    "currency": "USD"
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  configuration = EXCLUDED.configuration;

-- Sample Commercial Adapters (Disabled by default - require API keys)

-- LexisNexis
INSERT INTO config.database_adapters (
  id, name, adapter_type, jurisdictions, configuration, cost_model, enabled
) VALUES (
  'lexisnexis',
  'LexisNexis',
  'commercial',
  '["us", "us-*", "uk", "ca", "au"]'::jsonb,
  '{
    "endpoint": "https://api.lexisnexis.com/v1",
    "requiresAuth": true,
    "authType": "api_key"
  }'::jsonb,
  '{
    "baseCharge": 0.50,
    "perResult": 0.10,
    "currency": "USD"
  }'::jsonb,
  false
)
ON CONFLICT (id) DO NOTHING;

-- Westlaw
INSERT INTO config.database_adapters (
  id, name, adapter_type, jurisdictions, configuration, cost_model, enabled
) VALUES (
  'westlaw',
  'Westlaw',
  'commercial',
  '["us", "us-*"]'::jsonb,
  '{
    "endpoint": "https://api.westlaw.com/v1",
    "requiresAuth": true,
    "authType": "api_key"
  }'::jsonb,
  '{
    "baseCharge": 0.45,
    "perResult": 0.08,
    "currency": "USD"
  }'::jsonb,
  false
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SAMPLE DEMO USER (Development Only)
-- =============================================================================

-- Password: demo123456 (bcrypt hashed)
-- In production, remove this or change the password!
DO $$
DECLARE
  demo_org_id UUID;
BEGIN
  -- Get demo organization ID
  SELECT id INTO demo_org_id FROM config.organizations WHERE name = 'Demo Law Firm' LIMIT 1;

  IF demo_org_id IS NOT NULL THEN
    -- Insert demo user
    INSERT INTO nexus_law.users (
      id, email, password_hash, name, organization_id, role, active, created_at
    ) VALUES (
      uuid_generate_v4(),
      'demo@nexuslaw.ai',
      '$2a$10$X8qJ5fJ5fJ5fJ5fJ5fJ5fOZKqJ5fJ5fJ5fJ5fJ5fJ5fJ5fJ5fJ5fO',
      'Demo User',
      demo_org_id,
      'admin',
      true,
      NOW()
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;

-- =============================================================================
-- STATISTICS
-- =============================================================================

-- Update statistics for query optimization
ANALYZE config.organizations;
ANALYZE config.jurisdictions;
ANALYZE config.database_adapters;
ANALYZE nexus_law.users;

-- Display seed summary
DO $$
DECLARE
  org_count INT;
  jurisdiction_count INT;
  adapter_count INT;
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO org_count FROM config.organizations;
  SELECT COUNT(*) INTO jurisdiction_count FROM config.jurisdictions;
  SELECT COUNT(*) INTO adapter_count FROM config.database_adapters;
  SELECT COUNT(*) INTO user_count FROM nexus_law.users;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'Nexus Law Database Seeded Successfully';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Organizations: %', org_count;
  RAISE NOTICE 'Jurisdictions: %', jurisdiction_count;
  RAISE NOTICE 'Database Adapters: %', adapter_count;
  RAISE NOTICE 'Users: %', user_count;
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Demo Account:';
  RAISE NOTICE '  Email: demo@nexuslaw.ai';
  RAISE NOTICE '  Password: demo123456';
  RAISE NOTICE '  ⚠️  CHANGE IN PRODUCTION!';
  RAISE NOTICE '======================================';
END $$;
