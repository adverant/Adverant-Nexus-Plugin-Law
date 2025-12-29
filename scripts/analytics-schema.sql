/**
 * Nexus Law Analytics Database Schema
 *
 * Tables for metrics, cost tracking, and performance monitoring
 * Supports TimescaleDB extension for time-series data
 */

-- =============================================================================
-- ANALYTICS SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- =============================================================================
-- TIMESCALEDB EXTENSION (Optional - for production)
-- =============================================================================

-- Enable TimescaleDB extension (comment out if not available)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- METRICS TIME-SERIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.metrics_timeseries (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  period VARCHAR(20) NOT NULL, -- 'real-time', 'hour', 'day', 'week', 'month'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on timestamp for fast time-range queries
CREATE INDEX idx_metrics_timestamp ON analytics.metrics_timeseries (timestamp DESC);
CREATE INDEX idx_metrics_period ON analytics.metrics_timeseries (period, timestamp DESC);

-- Convert to hypertable if TimescaleDB is available
-- SELECT create_hypertable('analytics.metrics_timeseries', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- QUERY COSTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.query_costs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  query_id UUID NOT NULL,
  source_name VARCHAR(100) NOT NULL,
  source_type VARCHAR(20) NOT NULL, -- 'free', 'commercial'
  base_cost DECIMAL(10, 4) NOT NULL,
  per_result_cost DECIMAL(10, 4) NOT NULL,
  results_count INT NOT NULL,
  actual_cost DECIMAL(10, 4) NOT NULL,
  potential_cost DECIMAL(10, 4) NOT NULL, -- What it would cost with commercial only
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_query_costs_timestamp ON analytics.query_costs (timestamp DESC);
CREATE INDEX idx_query_costs_user ON analytics.query_costs (user_id, timestamp DESC);
CREATE INDEX idx_query_costs_org ON analytics.query_costs (organization_id, timestamp DESC);
CREATE INDEX idx_query_costs_source ON analytics.query_costs (source_name, timestamp DESC);

-- Convert to hypertable if TimescaleDB is available
-- SELECT create_hypertable('analytics.query_costs', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- PERFORMANCE SNAPSHOTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.performance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_performance_timestamp ON analytics.performance_snapshots (timestamp DESC);

-- Convert to hypertable if TimescaleDB is available
-- SELECT create_hypertable('analytics.performance_snapshots', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- PERFORMANCE ALERTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.performance_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_id VARCHAR(100) UNIQUE NOT NULL,
  severity VARCHAR(20) NOT NULL, -- 'info', 'warning', 'error', 'critical'
  type VARCHAR(50) NOT NULL, -- 'latency', 'error_rate', 'throughput', 'resource', 'service_unavailable'
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alerts_timestamp ON analytics.performance_alerts (timestamp DESC);
CREATE INDEX idx_alerts_severity ON analytics.performance_alerts (severity, timestamp DESC);
CREATE INDEX idx_alerts_type ON analytics.performance_alerts (type, timestamp DESC);
CREATE INDEX idx_alerts_unresolved ON analytics.performance_alerts (resolved, timestamp DESC) WHERE NOT resolved;

-- =============================================================================
-- SERVICE HEALTH TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.service_health (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  service_name VARCHAR(50) NOT NULL, -- 'mageagent', 'graphrag', 'fileprocess'
  available BOOLEAN NOT NULL,
  latency_ms DECIMAL(10, 2),
  error_rate DECIMAL(5, 2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_service_health_timestamp ON analytics.service_health (timestamp DESC);
CREATE INDEX idx_service_health_service ON analytics.service_health (service_name, timestamp DESC);

-- Convert to hypertable if TimescaleDB is available
-- SELECT create_hypertable('analytics.service_health', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- QUERY PERFORMANCE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.query_performance (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  query_id UUID NOT NULL,
  query_type VARCHAR(50) NOT NULL,
  duration_ms DECIMAL(10, 2) NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_query_perf_timestamp ON analytics.query_performance (timestamp DESC);
CREATE INDEX idx_query_perf_slow ON analytics.query_performance (duration_ms DESC) WHERE duration_ms > 1000;

-- Convert to hypertable if TimescaleDB is available
-- SELECT create_hypertable('analytics.query_performance', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- API LOGS TABLE (if not exists in main schema)
-- =============================================================================

CREATE TABLE IF NOT EXISTS nexus_law.api_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  organization_id UUID,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INT NOT NULL,
  latency_ms DECIMAL(10, 2) NOT NULL,
  request_size INT,
  response_size INT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON nexus_law.api_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_user ON nexus_law.api_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON nexus_law.api_logs (endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON nexus_law.api_logs (status_code, timestamp DESC);

-- =============================================================================
-- USER SESSIONS TABLE (if not exists in main schema)
-- =============================================================================

CREATE TABLE IF NOT EXISTS nexus_law.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES nexus_law.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON nexus_law.user_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON nexus_law.user_sessions (last_activity DESC) WHERE ended_at IS NULL;

-- =============================================================================
-- CONTINUOUS AGGREGATES (TimescaleDB only)
-- =============================================================================

-- Hourly metrics aggregate
-- CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.metrics_hourly
-- WITH (timescaledb.continuous) AS
-- SELECT
--   time_bucket('1 hour', timestamp) AS hour,
--   period,
--   COUNT(*) as count,
--   data
-- FROM analytics.metrics_timeseries
-- GROUP BY hour, period, data
-- WITH NO DATA;

-- Refresh continuous aggregate
-- SELECT add_continuous_aggregate_policy('analytics.metrics_hourly',
--   start_offset => INTERVAL '3 hours',
--   end_offset => INTERVAL '1 hour',
--   schedule_interval => INTERVAL '1 hour');

-- =============================================================================
-- DATA RETENTION POLICIES (TimescaleDB only)
-- =============================================================================

-- Drop raw metrics data older than 90 days
-- SELECT add_retention_policy('analytics.metrics_timeseries', INTERVAL '90 days');

-- Drop query costs older than 1 year
-- SELECT add_retention_policy('analytics.query_costs', INTERVAL '1 year');

-- Drop performance snapshots older than 30 days
-- SELECT add_retention_policy('analytics.performance_snapshots', INTERVAL '30 days');

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

/**
 * Get metrics summary for time period
 */
CREATE OR REPLACE FUNCTION analytics.get_metrics_summary(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) RETURNS TABLE (
  total_api_calls BIGINT,
  avg_latency DECIMAL,
  error_rate DECIMAL,
  total_queries BIGINT,
  total_documents BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_api_calls,
    AVG(latency_ms)::DECIMAL as avg_latency,
    (COUNT(*) FILTER (WHERE status_code >= 400) * 100.0 / NULLIF(COUNT(*), 0))::DECIMAL as error_rate,
    (SELECT COUNT(*)::BIGINT FROM nexus_law.queries WHERE created_at >= start_date AND created_at <= end_date),
    (SELECT COUNT(*)::BIGINT FROM nexus_law.documents WHERE created_at >= start_date AND created_at <= end_date)
  FROM nexus_law.api_logs
  WHERE timestamp >= start_date AND timestamp <= end_date;
END;
$$ LANGUAGE plpgsql;

/**
 * Get cost summary for time period
 */
CREATE OR REPLACE FUNCTION analytics.get_cost_summary(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) RETURNS TABLE (
  actual_cost DECIMAL,
  potential_cost DECIMAL,
  savings DECIMAL,
  savings_percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(actual_cost)::DECIMAL as actual_cost,
    SUM(potential_cost)::DECIMAL as potential_cost,
    SUM(potential_cost - actual_cost)::DECIMAL as savings,
    (SUM(potential_cost - actual_cost) * 100.0 / NULLIF(SUM(potential_cost), 0))::DECIMAL as savings_percentage
  FROM analytics.query_costs
  WHERE timestamp >= start_date AND timestamp <= end_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant permissions to analytics schema
GRANT USAGE ON SCHEMA analytics TO nexus_law_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO nexus_law_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO nexus_law_user;

-- Grant permissions on main schema tables
GRANT SELECT, INSERT ON nexus_law.api_logs TO nexus_law_user;
GRANT SELECT, INSERT, UPDATE ON nexus_law.user_sessions TO nexus_law_user;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA analytics IS 'Analytics and performance monitoring data';
COMMENT ON TABLE analytics.metrics_timeseries IS 'Time-series metrics data (1-minute granularity)';
COMMENT ON TABLE analytics.query_costs IS 'Query cost tracking for ROI analysis';
COMMENT ON TABLE analytics.performance_snapshots IS 'Performance snapshots for monitoring';
COMMENT ON TABLE analytics.performance_alerts IS 'Performance alerts and notifications';
COMMENT ON TABLE analytics.service_health IS 'Nexus Stack service health monitoring';
COMMENT ON TABLE analytics.query_performance IS 'Database query performance tracking';

-- =============================================================================
-- SEED DATA (Optional - for testing)
-- =============================================================================

-- Insert sample metrics for testing
-- INSERT INTO analytics.metrics_timeseries (timestamp, period, data) VALUES
--   (NOW() - INTERVAL '1 hour', 'real-time', '{"api": {"totalCalls": 100, "averageLatency": 150}}'),
--   (NOW() - INTERVAL '2 hours', 'real-time', '{"api": {"totalCalls": 120, "averageLatency": 145}}');

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  table_count INT;
BEGIN
  SELECT COUNT(*) INTO table_count FROM information_schema.tables WHERE table_schema = 'analytics';

  RAISE NOTICE '======================================';
  RAISE NOTICE 'Analytics Schema Created Successfully';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Tables created: %', table_count;
  RAISE NOTICE '======================================';
  RAISE NOTICE 'TimescaleDB Support:';
  RAISE NOTICE '  - Uncomment hypertable creation for production';
  RAISE NOTICE '  - Uncomment retention policies for auto-cleanup';
  RAISE NOTICE '  - Uncomment continuous aggregates for better performance';
  RAISE NOTICE '======================================';
END $$;
