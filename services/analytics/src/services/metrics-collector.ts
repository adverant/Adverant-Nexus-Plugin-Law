/**
 * Metrics Collector
 *
 * Collects and aggregates metrics from across the platform:
 * - API calls (total, by endpoint, by user)
 * - Research tasks (created, in progress, completed, failed)
 * - Documents processed (total, by type, success rate)
 * - Citations analyzed (networks built, cases analyzed)
 * - Queries executed (semantic, hybrid, graph)
 * - User activity (active users, sessions, actions)
 */

import { Pool } from 'pg';
import { createClient } from 'redis';

export interface MetricsSummary {
  timestamp: Date;
  period: 'real-time' | 'hour' | 'day' | 'week' | 'month';

  api: {
    totalCalls: number;
    callsByEndpoint: Record<string, number>;
    averageLatency: number;
    errorRate: number;
  };

  research: {
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
    averageCompletionTime: number; // seconds
  };

  documents: {
    processed: number;
    processingRate: number; // docs/hour
    successRate: number; // percentage
    byType: Record<string, number>;
  };

  citations: {
    networksBuilt: number;
    casesAnalyzed: number;
    averageDepth: number;
  };

  queries: {
    semantic: number;
    hybrid: number;
    graph: number;
    cacheHitRate: number; // percentage
  };

  users: {
    activeUsers: number;
    totalSessions: number;
    averageSessionDuration: number; // minutes
  };
}

export class MetricsCollector {
  constructor(private db: { pg: Pool; redis: any }) {}

  /**
   * Collect all metrics for current period
   */
  async collectAllMetrics(): Promise<MetricsSummary> {
    const timestamp = new Date();

    const [api, research, documents, citations, queries, users] = await Promise.all([
      this.collectAPIMetrics(),
      this.collectResearchMetrics(),
      this.collectDocumentMetrics(),
      this.collectCitationMetrics(),
      this.collectQueryMetrics(),
      this.collectUserMetrics(),
    ]);

    const summary: MetricsSummary = {
      timestamp,
      period: 'real-time',
      api,
      research,
      documents,
      citations,
      queries,
      users,
    };

    // Store in time-series table
    await this.storeMetrics(summary);

    // Cache for real-time dashboard
    await this.db.redis.setEx('analytics:metrics:latest', 60, JSON.stringify(summary));

    return summary;
  }

  /**
   * Collect API metrics
   */
  private async collectAPIMetrics() {
    // Total API calls in last minute
    const totalCallsResult = await this.db.pg.query(
      `SELECT COUNT(*) as total FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '1 minute'`
    );

    // Calls by endpoint
    const byEndpointResult = await this.db.pg.query(
      `SELECT endpoint, COUNT(*) as count FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '1 minute'
       GROUP BY endpoint`
    );

    // Average latency
    const latencyResult = await this.db.pg.query(
      `SELECT AVG(latency_ms) as avg_latency FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '1 minute'`
    );

    // Error rate
    const errorResult = await this.db.pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE status_code >= 400) * 100.0 / NULLIF(COUNT(*), 0) as error_rate
       FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '1 minute'`
    );

    const callsByEndpoint: Record<string, number> = {};
    for (const row of byEndpointResult.rows) {
      callsByEndpoint[row.endpoint] = parseInt(row.count, 10);
    }

    return {
      totalCalls: parseInt(totalCallsResult.rows[0]?.total || '0', 10),
      callsByEndpoint,
      averageLatency: parseFloat(latencyResult.rows[0]?.avg_latency || '0'),
      errorRate: parseFloat(errorResult.rows[0]?.error_rate || '0'),
    };
  }

  /**
   * Collect research task metrics
   */
  private async collectResearchMetrics() {
    const result = await this.db.pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute') as tasks_created,
         COUNT(*) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 minute') as tasks_completed,
         COUNT(*) FILTER (WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '1 minute') as tasks_failed,
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 hour') as avg_completion_time
       FROM nexus_law.research_tasks`
    );

    const row = result.rows[0];

    return {
      tasksCreated: parseInt(row?.tasks_created || '0', 10),
      tasksCompleted: parseInt(row?.tasks_completed || '0', 10),
      tasksFailed: parseInt(row?.tasks_failed || '0', 10),
      averageCompletionTime: parseFloat(row?.avg_completion_time || '0'),
    };
  }

  /**
   * Collect document processing metrics
   */
  private async collectDocumentMetrics() {
    const result = await this.db.pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as processed,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') * 1.0 as processing_rate,
         COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0) as success_rate
       FROM nexus_law.documents
       WHERE created_at > NOW() - INTERVAL '1 hour'`
    );

    const byTypeResult = await this.db.pg.query(
      `SELECT doc_type, COUNT(*) as count FROM nexus_law.documents
       WHERE created_at > NOW() - INTERVAL '1 hour'
       GROUP BY doc_type`
    );

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.doc_type] = parseInt(row.count, 10);
    }

    const row = result.rows[0];

    return {
      processed: parseInt(row?.processed || '0', 10),
      processingRate: parseFloat(row?.processing_rate || '0'),
      successRate: parseFloat(row?.success_rate || '0'),
      byType,
    };
  }

  /**
   * Collect citation metrics
   */
  private async collectCitationMetrics() {
    const result = await this.db.pg.query(
      `SELECT
         COUNT(DISTINCT case_id) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as networks_built,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as cases_analyzed,
         AVG(depth) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as avg_depth
       FROM nexus_law.citation_networks`
    );

    const row = result.rows[0];

    return {
      networksBuilt: parseInt(row?.networks_built || '0', 10),
      casesAnalyzed: parseInt(row?.cases_analyzed || '0', 10),
      averageDepth: parseFloat(row?.avg_depth || '0'),
    };
  }

  /**
   * Collect query metrics
   */
  private async collectQueryMetrics() {
    const result = await this.db.pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE query_type = 'semantic' AND created_at > NOW() - INTERVAL '1 hour') as semantic,
         COUNT(*) FILTER (WHERE query_type = 'hybrid' AND created_at > NOW() - INTERVAL '1 hour') as hybrid,
         COUNT(*) FILTER (WHERE query_type = 'graph' AND created_at > NOW() - INTERVAL '1 hour') as graph,
         COUNT(*) FILTER (WHERE cached = true) * 100.0 / NULLIF(COUNT(*), 0) as cache_hit_rate
       FROM nexus_law.queries
       WHERE created_at > NOW() - INTERVAL '1 hour'`
    );

    const row = result.rows[0];

    return {
      semantic: parseInt(row?.semantic || '0', 10),
      hybrid: parseInt(row?.hybrid || '0', 10),
      graph: parseInt(row?.graph || '0', 10),
      cacheHitRate: parseFloat(row?.cache_hit_rate || '0'),
    };
  }

  /**
   * Collect user activity metrics
   */
  private async collectUserMetrics() {
    const result = await this.db.pg.query(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE last_activity > NOW() - INTERVAL '15 minutes') as active_users,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as total_sessions,
         AVG(EXTRACT(EPOCH FROM (ended_at - created_at)) / 60) FILTER (WHERE ended_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 day') as avg_session_duration
       FROM nexus_law.user_sessions`
    );

    const row = result.rows[0];

    return {
      activeUsers: parseInt(row?.active_users || '0', 10),
      totalSessions: parseInt(row?.total_sessions || '0', 10),
      averageSessionDuration: parseFloat(row?.avg_session_duration || '0'),
    };
  }

  /**
   * Store metrics in time-series table
   */
  private async storeMetrics(summary: MetricsSummary): Promise<void> {
    try {
      await this.db.pg.query(
        `INSERT INTO analytics.metrics_timeseries (
          timestamp, period, data
        ) VALUES ($1, $2, $3)`,
        [summary.timestamp, summary.period, JSON.stringify(summary)]
      );
    } catch (error) {
      console.error('Failed to store metrics:', error);
      // Don't throw - metrics collection should not fail pipeline
    }
  }

  /**
   * Get metrics for time period
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<MetricsSummary[]> {
    const result = await this.db.pg.query(
      `SELECT data FROM analytics.metrics_timeseries
       WHERE timestamp >= $1 AND timestamp <= $2 AND period = $3
       ORDER BY timestamp ASC`,
      [startDate, endDate, period]
    );

    return result.rows.map((row) => JSON.parse(row.data));
  }

  /**
   * Get latest real-time metrics (from cache)
   */
  async getLatestMetrics(): Promise<MetricsSummary | null> {
    try {
      const cached = await this.db.redis.get('analytics:metrics:latest');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to get cached metrics:', error);
    }

    return null;
  }
}
