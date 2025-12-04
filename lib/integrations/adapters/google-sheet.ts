// lib/integrations/adapters/google-sheet.ts
// Google Sheets integration adapter

import { IntegrationAdapter, IntegrationCredentials, IntegrationConfig } from "./base";

export class GoogleSheetAdapter implements IntegrationAdapter {
  private readonly baseUrl = "https://sheets.googleapis.com/v4";
  
  async authenticate(credentials: IntegrationCredentials): Promise<string> {
    // Check if token is expired
    if (credentials.token_expires_at && 
        new Date(credentials.token_expires_at) < new Date()) {
      // Refresh token
      return await this.refreshToken(credentials.refresh_token || "");
    }
    
    return credentials.oauth_token || "";
  }
  
  async fetchData(config: IntegrationConfig, dataSource: any): Promise<string> {
    const token = await this.authenticate(config);
    
    if (!token) {
      throw new Error("No valid authentication token");
    }
    
    const spreadsheetId = config.spreadsheet_id;
    const range = config.range || "Sheet1!A1:Z100";
    
    if (!spreadsheetId) {
      throw new Error("Spreadsheet ID not configured");
    }
    
    const response = await fetch(
      `${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try refresh
        const refreshedToken = await this.refreshToken(config.refresh_token || "");
        return await this.fetchData({ ...config, oauth_token: refreshedToken }, dataSource);
      }
      throw new Error(`Google Sheets API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    // Format sheet data as text
    if (!data.values || data.values.length === 0) {
      return "Sheet is empty.";
    }
    
    // First row as headers
    const headers = data.values[0] || [];
    const rows = data.values.slice(1);
    
    // Format as table
    const formattedRows = rows.map((row: string[]) => {
      return row.map((cell, i) => `${headers[i] || `Column ${i + 1}`}: ${cell || ""}`).join(" | ");
    }).join("\n");
    
    return `Sheet data:\n${formattedRows}`;
  }
  
  async refreshToken(refreshToken: string): Promise<string> {
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured");
    }
    
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.status}`);
    }
    
    const data = await response.json();
    return data.access_token;
  }
  
  validateConfig(config: IntegrationConfig): boolean {
    return !!(config.spreadsheet_id || config.provider === "google");
  }
}



