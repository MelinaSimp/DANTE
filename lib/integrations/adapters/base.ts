// lib/integrations/adapters/base.ts
// Base interface for integration adapters

export interface IntegrationAdapter {
  /**
   * Authenticate and get access token
   */
  authenticate(credentials: any): Promise<string>;
  
  /**
   * Fetch data from the integration
   */
  fetchData(config: any, dataSource: any): Promise<string>;
  
  /**
   * Refresh OAuth token
   */
  refreshToken(token: string): Promise<string>;
  
  /**
   * Validate configuration
   */
  validateConfig(config: any): boolean;
}

export interface IntegrationCredentials {
  oauth_token?: string;
  refresh_token?: string;
  api_key?: string;
  token_expires_at?: string;
  [key: string]: any;
}

export interface IntegrationConfig {
  provider: string;
  [key: string]: any;
}


