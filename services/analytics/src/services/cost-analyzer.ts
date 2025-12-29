/**
 * Cost Analyzer
 *
 * Tracks and analyzes costs across all legal database sources:
 * - Actual costs (queries to commercial databases)
 * - Cost savings (free sources vs. commercial)
 * - Cost breakdown by source, user, organization
 * - Cost projections and budgeting
 * - ROI calculations
 */

import { Pool } from 'pg';
import { createClient } from 'redis';

export interface CostSummary {
  period: {
    start: Date;
    end: Date;
  };

  total: {
    actualCost: number; // USD spent
    potentialCost: number; // What it would have cost with commercial only
    savings: number; // potentialCost - actualCost
    savingsPercentage: number;
  };

  bySource: {
    sourceName: string;
    queries: number;
    cost: number;
    avgCostPerQuery: number;
  }[];

  byUser: {
    userId: string;
    email: string;
    queries: number;
    cost: number;
    savings: number;
  }[];

  byOrganization: {
    organizationId: string;
    name: string;
    queries: number;
    cost: number;
    savings: number;
  }[];

  projection: {
    monthly: number;
    quarterly: number;
    annual: number;
  };

  roi: {
    platformCost: number; // Subscription cost
    actualQueryCost: number;
    totalCost: number;
    savingsVsCommercial: number; // Savings compared to Westlaw/LexisNexis only
    roiPercentage: number;
  };
}

export interface CostBreakdown {
  timestamp: Date;
  queryId: string;
  source: string;
  sourceType: 'free' | 'commercial';
  baseCost: number;
  perResultCost: number;
  resultsCount: number;
  totalCost: number;
  userId: string;
  organizationId: string;
}

export class CostAnalyzer {
  constructor(private db: { pg: Pool; redis: any }) {}

  /**
   * Analyze costs for time period
   */
  async analyzeCosts(startDate: Date, endDate: Date): Promise<CostSummary> {
    const [total, bySource, byUser, byOrganization] = await Promise.all([
      this.calculateTotalCosts(startDate, endDate),
      this.calculateCostsBySource(startDate, endDate),
      this.calculateCostsByUser(startDate, endDate),
      this.calculateCostsByOrganization(startDate, endDate),
    ]);

    const projection = await this.projectCosts(startDate, endDate);
    const roi = await this.calculateROI(startDate, endDate, total);

    const summary: CostSummary = {
      period: { start: startDate, end: endDate },
      total,
      bySource,
      byUser,
      byOrganization,
      projection,
      roi,
    };

    // Cache summary
    const cacheKey = `analytics:cost:${startDate.toISOString()}:${endDate.toISOString()}`;
    await this.db.redis.setEx(cacheKey, 3600, JSON.stringify(summary)); // 1 hour cache

    return summary;
  }

  /**
   * Calculate total costs and savings
   */
  private async calculateTotalCosts(startDate: Date, endDate: Date) {
    const result = await this.db.pg.query(
      `SELECT
         SUM(actual_cost) as actual_cost,
         SUM(potential_cost) as potential_cost
       FROM analytics.query_costs
       WHERE timestamp >= $1 AND timestamp <= $2`,
      [startDate, endDate]
    );

    const row = result.rows[0];
    const actualCost = parseFloat(row?.actual_cost || '0');
    const potentialCost = parseFloat(row?.potential_cost || '0');
    const savings = potentialCost - actualCost;
    const savingsPercentage = potentialCost > 0 ? (savings / potentialCost) * 100 : 0;

    return {
      actualCost,
      potentialCost,
      savings,
      savingsPercentage,
    };
  }

  /**
   * Calculate costs by source
   */
  private async calculateCostsBySource(startDate: Date, endDate: Date) {
    const result = await this.db.pg.query(
      `SELECT
         source_name,
         COUNT(*) as queries,
         SUM(actual_cost) as cost,
         AVG(actual_cost) as avg_cost
       FROM analytics.query_costs
       WHERE timestamp >= $1 AND timestamp <= $2
       GROUP BY source_name
       ORDER BY cost DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row) => ({
      sourceName: row.source_name,
      queries: parseInt(row.queries, 10),
      cost: parseFloat(row.cost),
      avgCostPerQuery: parseFloat(row.avg_cost),
    }));
  }

  /**
   * Calculate costs by user
   */
  private async calculateCostsByUser(startDate: Date, endDate: Date) {
    const result = await this.db.pg.query(
      `SELECT
         c.user_id,
         u.email,
         COUNT(*) as queries,
         SUM(c.actual_cost) as cost,
         SUM(c.potential_cost - c.actual_cost) as savings
       FROM analytics.query_costs c
       JOIN nexus_law.users u ON c.user_id = u.id
       WHERE c.timestamp >= $1 AND c.timestamp <= $2
       GROUP BY c.user_id, u.email
       ORDER BY cost DESC
       LIMIT 100`,
      [startDate, endDate]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      queries: parseInt(row.queries, 10),
      cost: parseFloat(row.cost),
      savings: parseFloat(row.savings),
    }));
  }

  /**
   * Calculate costs by organization
   */
  private async calculateCostsByOrganization(startDate: Date, endDate: Date) {
    const result = await this.db.pg.query(
      `SELECT
         c.organization_id,
         o.name,
         COUNT(*) as queries,
         SUM(c.actual_cost) as cost,
         SUM(c.potential_cost - c.actual_cost) as savings
       FROM analytics.query_costs c
       JOIN config.organizations o ON c.organization_id = o.id
       WHERE c.timestamp >= $1 AND c.timestamp <= $2
       GROUP BY c.organization_id, o.name
       ORDER BY cost DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      name: row.name,
      queries: parseInt(row.queries, 10),
      cost: parseFloat(row.cost),
      savings: parseFloat(row.savings),
    }));
  }

  /**
   * Project costs for future periods
   */
  private async projectCosts(startDate: Date, endDate: Date) {
    // Calculate daily average cost
    const daysInPeriod = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    const result = await this.db.pg.query(
      `SELECT SUM(actual_cost) as total_cost
       FROM analytics.query_costs
       WHERE timestamp >= $1 AND timestamp <= $2`,
      [startDate, endDate]
    );

    const totalCost = parseFloat(result.rows[0]?.total_cost || '0');
    const dailyAverage = daysInPeriod > 0 ? totalCost / daysInPeriod : 0;

    return {
      monthly: dailyAverage * 30,
      quarterly: dailyAverage * 90,
      annual: dailyAverage * 365,
    };
  }

  /**
   * Calculate ROI
   */
  private async calculateROI(
    startDate: Date,
    endDate: Date,
    totalCosts: { actualCost: number; potentialCost: number; savings: number }
  ) {
    // Assume platform subscription cost
    const platformCost = 299; // $299/month for Pro plan

    // Calculate period length in months
    const daysInPeriod = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const monthsInPeriod = daysInPeriod / 30;

    const platformCostForPeriod = platformCost * monthsInPeriod;
    const actualQueryCost = totalCosts.actualCost;
    const totalCost = platformCostForPeriod + actualQueryCost;
    const savingsVsCommercial = totalCosts.savings;

    const roiPercentage = totalCost > 0 ? (savingsVsCommercial / totalCost) * 100 : 0;

    return {
      platformCost: platformCostForPeriod,
      actualQueryCost,
      totalCost,
      savingsVsCommercial,
      roiPercentage,
    };
  }

  /**
   * Record query cost
   */
  async recordQueryCost(cost: CostBreakdown): Promise<void> {
    try {
      // Determine potential cost (what it would cost with commercial only)
      const potentialCost = cost.sourceType === 'free' ? 0.50 : cost.totalCost; // Assume $0.50 for commercial

      await this.db.pg.query(
        `INSERT INTO analytics.query_costs (
          timestamp, query_id, source_name, source_type,
          base_cost, per_result_cost, results_count, actual_cost, potential_cost,
          user_id, organization_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          cost.timestamp,
          cost.queryId,
          cost.source,
          cost.sourceType,
          cost.baseCost,
          cost.perResultCost,
          cost.resultsCount,
          cost.totalCost,
          potentialCost,
          cost.userId,
          cost.organizationId,
        ]
      );
    } catch (error) {
      console.error('Failed to record query cost:', error);
      // Don't throw - cost tracking should not fail queries
    }
  }

  /**
   * Get cost trends over time
   */
  async getCostTrends(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<{ timestamp: Date; cost: number; savings: number }>> {
    let truncFunction = 'day';
    switch (granularity) {
      case 'hour':
        truncFunction = 'hour';
        break;
      case 'day':
        truncFunction = 'day';
        break;
      case 'week':
        truncFunction = 'week';
        break;
      case 'month':
        truncFunction = 'month';
        break;
    }

    const result = await this.db.pg.query(
      `SELECT
         date_trunc($3, timestamp) as timestamp,
         SUM(actual_cost) as cost,
         SUM(potential_cost - actual_cost) as savings
       FROM analytics.query_costs
       WHERE timestamp >= $1 AND timestamp <= $2
       GROUP BY date_trunc($3, timestamp)
       ORDER BY timestamp ASC`,
      [startDate, endDate, truncFunction]
    );

    return result.rows.map((row) => ({
      timestamp: row.timestamp,
      cost: parseFloat(row.cost),
      savings: parseFloat(row.savings),
    }));
  }

  /**
   * Get top cost drivers
   */
  async getTopCostDrivers(startDate: Date, endDate: Date, limit: number = 10) {
    const result = await this.db.pg.query(
      `SELECT
         u.email,
         q.query,
         c.source_name,
         c.actual_cost,
         c.timestamp
       FROM analytics.query_costs c
       JOIN nexus_law.users u ON c.user_id = u.id
       JOIN nexus_law.queries q ON c.query_id = q.id
       WHERE c.timestamp >= $1 AND c.timestamp <= $2
       ORDER BY c.actual_cost DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map((row) => ({
      user: row.email,
      query: row.query.substring(0, 100), // Truncate long queries
      source: row.source_name,
      cost: parseFloat(row.actual_cost),
      timestamp: row.timestamp,
    }));
  }
}
