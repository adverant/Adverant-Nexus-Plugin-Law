/**
 * Circuit Breaker Middleware
 *
 * Prevents cascading failures by temporarily blocking requests to failing services
 */

import { Request, Response, NextFunction } from 'express';
import { ServiceUnavailableError } from './error-handler';

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  nextAttemptTime: number;
}

class CircuitBreaker {
  private circuits: Map<string, CircuitBreakerState> = new Map();

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000, // 1 minute
    private halfOpenMaxAttempts: number = 3
  ) {}

  /**
   * Get or initialize circuit for a service
   */
  private getCircuit(serviceName: string): CircuitBreakerState {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: 0,
        lastSuccessTime: Date.now(),
        nextAttemptTime: 0,
      });
    }
    return this.circuits.get(serviceName)!;
  }

  /**
   * Check if request should be allowed
   */
  canAttempt(serviceName: string): boolean {
    const circuit = this.getCircuit(serviceName);
    const now = Date.now();

    switch (circuit.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if enough time has passed to attempt half-open
        if (now >= circuit.nextAttemptTime) {
          circuit.state = 'HALF_OPEN';
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return false;
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    circuit.lastSuccessTime = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      // Success in half-open state - close the circuit
      circuit.state = 'CLOSED';
      circuit.failures = 0;
    } else if (circuit.state === 'CLOSED') {
      // Gradual recovery - reduce failure count
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  }

  /**
   * Record failed request
   */
  recordFailure(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    const now = Date.now();

    circuit.failures++;
    circuit.lastFailureTime = now;

    if (circuit.state === 'HALF_OPEN') {
      // Failure in half-open state - reopen the circuit
      circuit.state = 'OPEN';
      circuit.nextAttemptTime = now + this.resetTimeout;
    } else if (circuit.failures >= this.failureThreshold) {
      // Too many failures - open the circuit
      circuit.state = 'OPEN';
      circuit.nextAttemptTime = now + this.resetTimeout;
    }
  }

  /**
   * Get circuit state for monitoring
   */
  getState(serviceName: string): CircuitBreakerState {
    return this.getCircuit(serviceName);
  }

  /**
   * Get all circuit states
   */
  getAllStates(): Record<string, CircuitBreakerState> {
    const states: Record<string, CircuitBreakerState> = {};
    for (const [name, state] of this.circuits.entries()) {
      states[name] = { ...state };
    }
    return states;
  }

  /**
   * Reset circuit (force close)
   */
  reset(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.lastFailureTime = 0;
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    for (const [serviceName] of this.circuits) {
      this.reset(serviceName);
    }
  }
}

// Global circuit breaker instance
const circuitBreakerInstance = new CircuitBreaker(
  parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
  parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000', 10)
);

/**
 * Circuit breaker middleware factory
 */
export function circuitBreaker(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!circuitBreakerInstance.canAttempt(serviceName)) {
      const state = circuitBreakerInstance.getState(serviceName);
      throw new ServiceUnavailableError(serviceName, {
        circuitState: state.state,
        failures: state.failures,
        nextAttemptTime: new Date(state.nextAttemptTime).toISOString(),
        message: 'Circuit breaker is OPEN - service is temporarily unavailable',
      });
    }

    // Intercept response to record success/failure
    const originalSend = res.send;
    const originalJson = res.json;

    const recordResult = () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        circuitBreakerInstance.recordSuccess(serviceName);
      } else if (res.statusCode >= 500) {
        circuitBreakerInstance.recordFailure(serviceName);
      }
    };

    res.send = function (data: any): Response {
      recordResult();
      return originalSend.call(this, data);
    };

    res.json = function (data: any): Response {
      recordResult();
      return originalJson.call(this, data);
    };

    next();
  };
}

// Export circuit breaker instance for monitoring
export { circuitBreakerInstance };
