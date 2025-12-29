/**
 * Additional adapter-specific types
 */

export interface AdapterConfig {
  /** Adapter ID */
  id: string;

  /** Adapter name */
  name: string;

  /** Module path for dynamic loading */
  modulePath: string;

  /** Configuration */
  config: Record<string, any>;

  /** Enabled status */
  enabled: boolean;
}

export interface AdapterRegistry {
  /** All registered adapters */
  adapters: Map<string, any>;

  /** Register a new adapter */
  register(adapter: any): void;

  /** Get adapter by ID */
  get(id: string): any | undefined;

  /** Get all adapters for jurisdiction */
  getByJurisdiction(jurisdiction: string): any[];
}
