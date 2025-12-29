/**
 * Performance Monitor
 *
 * Monitors platform performance in real-time:
 * - API latency (p50, p95, p99)
 * - Throughput (requests/second)
 * - Error rates by type
 * - Database query performance
 * - External service latency (Nexus Stack)
 * - Resource utilization
 * - Alerts and anomaly detection
 */

import { Pool } from 'pg';
import { createClient } from 'redis';

export interface PerformanceSnapshot {
  timestamp: Date;

  api: {
    latency: {
      p50: number; // 50th percentile (median)
      p95: number; // 95th percentile
      p99: number; // 99th percentile
      max: number;
    };
    throughput: number; // requests per second
    errorRate: number; // percentage
    errorsByType: Record<string, number>;
  };

  database: {
    activeConnections: number;
    idleConnections: number;
    avgQueryTime: number; // ms
    slowQueries: number; // queries > 1 second
  };

  nexusStack: {
    mageAgent: {
      available: boolean;
      latency: number;
      errorRate: number;
    };
    graphRAG: {
      available: boolean;
      latency: number;
      errorRate: number;
    };
    fileProcess: {
      available: boolean;
      latency: number;
      queueSize: number;
    };
  };

  resources: {
    memoryUsage: {
      heapUsed: number; // MB
      heapTotal: number; // MB
      external: number; // MB
      rss: number; // MB
    };
    cpu: {
      user: number; // microseconds
      system: number; // microseconds
    };
  };

  alerts: Alert[];
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: 'latency' | 'error_rate' | 'throughput' | 'resource' | 'service_unavailable';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PerformanceTrend {
  metric: string;
  dataPoints: Array<{
    timestamp: Date;
    value: number;
  }>;
  trend: 'improving' | 'stable' | 'degrading';
  changePercentage: number;
}

export class PerformanceMonitor {
  private alerts: Alert[] = [];

  constructor(private db: { pg: Pool; redis: any }) {}

  /**
   * Capture current performance snapshot
   */
  async captureSnapshot(): Promise<PerformanceSnapshot> {
    const timestamp = new Date();

    const [api, database, nexusStack, resources] = await Promise.all([
      this.measureAPIPerformance(),
      this.measureDatabasePerformance(),
      this.measureNexusStackPerformance(),
      this.measureResourceUtilization(),
    ]);

    // Check for performance issues and generate alerts
    this.checkPerformanceAlerts(api, database, nexusStack, resources);

    const snapshot: PerformanceSnapshot = {
      timestamp,
      api,
      database,
      nexusStack,
      resources,
      alerts: [...this.alerts],
    };

    // Store snapshot
    await this.storeSnapshot(snapshot);

    // Cache for real-time access
    await this.db.redis.setEx('analytics:performance:latest', 60, JSON.stringify(snapshot));

    return snapshot;
  }

  /**
   * Measure API performance
   */
  private async measureAPIPerformance() {
    // Get latency percentiles from last 5 minutes
    const latencyResult = await this.db.pg.query(
      `SELECT
         percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
         MAX(latency_ms) as max
       FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '5 minutes'`
    );

    // Calculate throughput (requests per second)
    const throughputResult = await this.db.pg.query(
      `SELECT COUNT(*) as requests FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '1 minute'`
    );

    const requestsLastMinute = parseInt(throughputResult.rows[0]?.requests || '0', 10);
    const throughput = requestsLastMinute / 60; // requests per second

    // Error rate
    const errorResult = await this.db.pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE status_code >= 400) * 100.0 / NULLIF(COUNT(*), 0) as error_rate
       FROM nexus_law.api_logs
       WHERE created_at > NOW() - INTERVAL '5 minutes'`
    );

    // Errors by type
    const errorsByTypeResult = await this.db.pg.query(
      `SELECT
         CASE
           WHEN status_code = 400 THEN 'bad_request'
           WHEN status_code = 401 THEN 'unauthorized'
           WHEN status_code = 403 THEN 'forbidden'
           WHEN status_code = 404 THEN 'not_found'
           WHEN status_code = 429 THEN 'rate_limited'
           WHEN status_code >= 500 THEN 'server_error'
           ELSE 'other'
         END as error_type,
         COUNT(*) as count
       FROM nexus_law.api_logs
       WHERE status_code >= 400 AND created_at > NOW() - INTERVAL '5 minutes'
       GROUP BY error_type`
    );

    const errorsByType: Record<string, number> = {};
    for (const row of errorsByTypeResult.rows) {
      errorsByType[row.error_type] = parseInt(row.count, 10);
    }

    const latency = latencyResult.rows[0];

    return {
      latency: {
        p50: parseFloat(latency?.p50 || '0'),
        p95: parseFloat(latency?.p95 || '0'),
        p99: parseFloat(latency?.p99 || '0'),
        max: parseFloat(latency?.max || '0'),
      },
      throughput,
      errorRate: parseFloat(errorResult.rows[0]?.error_rate || '0'),
      errorsByType,
    };
  }

  /**
   * Measure database performance
   */
  private async measureDatabasePerformance() {
    // Connection pool stats
    const poolStats = await this.db.pg.query(
      `SELECT
         (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
         (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle`
    );

    // Average query time
    const queryTimeResult = await this.db.pg.query(
      `SELECT AVG(duration_ms) as avg_query_time
       FROM analytics.query_performance
       WHERE timestamp > NOW() - INTERVAL '5 minutes'`
    );

    // Slow queries (> 1 second)
    const slowQueriesResult = await this.db.pg.query(
      `SELECT COUNT(*) as slow_queries
       FROM analytics.query_performance
       WHERE duration_ms > 1000 AND timestamp > NOW() - INTERVAL '5 minutes'`
    );

    const stats = poolStats.rows[0];

    return {
      activeConnections: parseInt(stats?.active || '0', 10),
      idleConnections: parseInt(stats?.idle || '0', 10),
      avgQueryTime: parseFloat(queryTimeResult.rows[0]?.avg_query_time || '0'),
      slowQueries: parseInt(slowQueriesResult.rows[0]?.slow_queries || '0', 10),
    };
  }

  /**
   * Measure Nexus Stack service performance
   */
  private async measureNexusStackPerformance() {
    // Get service health from recent checks
    const servicesResult = await this.db.pg.query(
      `SELECT
         service_name,
         available,
         latency_ms,
         error_rate
       FROM analytics.service_health
       WHERE timestamp > NOW() - INTERVAL '5 minutes'
       ORDER BY timestamp DESC
       LIMIT 3`
    );

    const services = {
      mageAgent: { available: false, latency: 0, errorRate: 0 },
      graphRAG: { available: false, latency: 0, errorRate: 0 },
      fileProcess: { available: false, latency: 0, queueSize: 0 },
    };

    for (const row of servicesResult.rows) {
      const service = row.service_name;
      if (service === 'mageagent') {
        services.mageAgent = {
          available: row.available,
          latency: parseFloat(row.latency_ms),
          errorRate: parseFloat(row.error_rate),
        };
      } else if (service === 'graphrag') {
        services.graphRAG = {
          available: row.available,
          latency: parseFloat(row.latency_ms),
          errorRate: parseFloat(row.error_rate),
        };
      } else if (service === 'fileprocess') {
        services.fileProcess = {
          available: row.available,
          latency: parseFloat(row.latency_ms),
          queueSize: 0, // Would query from FileProcess API
        };
      }
    }

    return services;
  }

  /**
   * Measure resource utilization
   */
  private measureResourceUtilization() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
      memoryUsage: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
    };
  }

  /**
   * Check for performance issues and generate alerts
   */
  private checkPerformanceAlerts(
    api: any,
    database: any,
    nexusStack: any,
    resources: any
  ): void {
    this.alerts = []; // Clear previous alerts

    // High API latency
    if (api.latency.p95 > 2000) {
      this.alerts.push({
        id: `alert_${Date.now()}_latency`,
        severity: 'warning',
        type: 'latency',
        message: `High API latency detected: P95 = ${api.latency.p95.toFixed(0)}ms (threshold: 2000ms)`,
        timestamp: new Date(),
        metadata: { p95: api.latency.p95 },
      });
    }

    // High error rate
    if (api.errorRate > 5) {
      this.alerts.push({
        id: `alert_${Date.now()}_error_rate`,
        severity: 'error',
        type: 'error_rate',
        message: `High error rate detected: ${api.errorRate.toFixed(2)}% (threshold: 5%)`,
        timestamp: new Date(),
        metadata: { errorRate: api.errorRate, errorsByType: api.errorsByType },
      });
    }

    // Low throughput (< 0.1 req/sec might indicate issues)
    if (api.throughput < 0.1 && api.throughput > 0) {
      this.alerts.push({
        id: `alert_${Date.now()}_throughput`,
        severity: 'info',
        type: 'throughput',
        message: `Low throughput detected: ${api.throughput.toFixed(2)} req/sec`,
        timestamp: new Date(),
        metadata: { throughput: api.throughput },
      });
    }

    // Slow database queries
    if (database.slowQueries > 10) {
      this.alerts.push({
        id: `alert_${Date.now()}_slow_queries`,
        severity: 'warning',
        type: 'latency',
        message: `${database.slowQueries} slow queries detected (> 1 second)`,
        timestamp: new Date(),
        metadata: { slowQueries: database.slowQueries },
      });
    }

    // Nexus Stack services unavailable
    if (!nexusStack.mageAgent.available) {
      this.alerts.push({
        id: `alert_${Date.now()}_mageagent`,
        severity: 'critical',
        type: 'service_unavailable',
        message: 'MageAgent service is unavailable',
        timestamp: new Date(),
      });
    }

    if (!nexusStack.graphRAG.available) {
      this.alerts.push({
        id: `alert_${Date.now()}_graphrag`,
        severity: 'critical',
        type: 'service_unavailable',
        message: 'GraphRAG service is unavailable',
        timestamp: new Date(),
      });
    }

    if (!nexusStack.fileProcess.available) {
      this.alerts.push({
        id: `alert_${Date.now()}_fileprocess`,
        severity: 'critical',
        type: 'service_unavailable',
        message: 'FileProcess service is unavailable',
        timestamp: new Date(),
      });
    }

    // High memory usage (> 80% of heap)
    const memoryUsagePercent = (resources.memoryUsage.heapUsed / resources.memoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > 80) {
      this.alerts.push({
        id: `alert_${Date.now()}_memory`,
        severity: 'warning',
        type: 'resource',
        message: `High memory usage: ${memoryUsagePercent.toFixed(1)}% of heap`,
        timestamp: new Date(),
        metadata: { memoryUsage: resources.memoryUsage },
      });
    }
  }

  /**
   * Store performance snapshot
   */
  private async storeSnapshot(snapshot: PerformanceSnapshot): Promise<void> {
    try {
      await this.db.pg.query(
        `INSERT INTO analytics.performance_snapshots (timestamp, data)
         VALUES ($1, $2)`,
        [snapshot.timestamp, JSON.stringify(snapshot)]
      );

      // Store alerts separately for easy querying
      for (const alert of snapshot.alerts) {
        await this.db.pg.query(
          `INSERT INTO analytics.performance_alerts (
            alert_id, severity, type, message, timestamp, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [alert.id, alert.severity, alert.type, alert.message, alert.timestamp, JSON.stringify(alert.metadata || {})]
        );
      }
    } catch (error) {
      console.error('Failed to store performance snapshot:', error);
    }
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(
    metric: string,
    startDate: Date,
    endDate: Date,
    granularity: 'minute' | 'hour' | 'day' = 'hour'
  ): Promise<PerformanceTrend> {
    // Extract metric from snapshots
    const result = await this.db.pg.query(
      `SELECT timestamp, data
       FROM analytics.performance_snapshots
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp ASC`,
      [startDate, endDate]
    );

    const dataPoints: Array<{ timestamp: Date; value: number }> = [];

    for (const row of result.rows) {
      const snapshot = JSON.parse(row.data);
      const value = this.extractMetricValue(snapshot, metric);
      if (value !== null) {
        dataPoints.push({
          timestamp: row.timestamp,
          value,
        });
      }
    }

    // Calculate trend
    const trend = this.calculateTrend(dataPoints);

    return {
      metric,
      dataPoints,
      trend: trend.direction,
      changePercentage: trend.changePercentage,
    };
  }

  /**
   * Extract metric value from snapshot
   */
  private extractMetricValue(snapshot: any, metric: string): number | null {
    const paths: Record<string, string[]> = {
      'api.latency.p95': ['api', 'latency', 'p95'],
      'api.throughput': ['api', 'throughput'],
      'api.errorRate': ['api', 'errorRate'],
      'database.avgQueryTime': ['database', 'avgQueryTime'],
      'resources.memoryUsage.heapUsed': ['resources', 'memoryUsage', 'heapUsed'],
    };

    const path = paths[metric];
    if (!path) return null;

    let value = snapshot;
    for (const key of path) {
      value = value[key];
      if (value === undefined) return null;
    }

    return typeof value === 'number' ? value : null;
  }

  /**
   * Calculate trend from data points
   */
  private calculateTrend(dataPoints: Array<{ timestamp: Date; value: number }>) {
    if (dataPoints.length < 2) {
      return { direction: 'stable' as const, changePercentage: 0 };
    }

    // Compare first and last values
    const firstValue = dataPoints[0].value;
    const lastValue = dataPoints[dataPoints.length - 1].value;

    const changePercentage = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

    let direction: 'improving' | 'stable' | 'degrading' = 'stable';
    if (Math.abs(changePercentage) > 10) {
      // For latency/errors, decreasing is improving
      if (changePercentage < 0) {
        direction = 'improving';
      } else {
        direction = 'degrading';
      }
    }

    return { direction, changePercentage };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(severity?: 'info' | 'warning' | 'error' | 'critical'): Promise<Alert[]> {
    let query = `SELECT * FROM analytics.performance_alerts
                 WHERE timestamp > NOW() - INTERVAL '1 hour'`;
    const params: any[] = [];

    if (severity) {
      query += ` AND severity = $1`;
      params.push(severity);
    }

    query += ` ORDER BY timestamp DESC LIMIT 100`;

    const result = await this.db.pg.query(query, params);

    return result.rows.map((row) => ({
      id: row.alert_id,
      severity: row.severity,
      type: row.type,
      message: row.message,
      timestamp: row.timestamp,
      metadata: JSON.parse(row.metadata),
    }));
  }
}
