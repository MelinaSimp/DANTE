// lib/integrations/adapters/google-calendar.ts
// Google Calendar integration adapter

import { IntegrationAdapter, IntegrationCredentials, IntegrationConfig } from "./base";

export class GoogleCalendarAdapter implements IntegrationAdapter {
  private readonly baseUrl = "https://www.googleapis.com/calendar/v3";
  
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
    
    const calendarId = config.calendar_id || "primary";
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    
    const response = await fetch(
      `${this.baseUrl}/calendars/${calendarId}/events?` +
      `timeMin=${timeMin}&` +
      `timeMax=${timeMax}&` +
      `singleEvents=true&` +
      `orderBy=startTime&` +
      `maxResults=50`,
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
      throw new Error(`Google Calendar API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    // Format events as text
    if (!data.items || data.items.length === 0) {
      return "No upcoming events in the next 7 days.";
    }
    
    const events = data.items.map((event: any) => {
      const start = event.start?.dateTime || event.start?.date;
      const summary = event.summary || "No title";
      return `${summary} - ${new Date(start).toLocaleString()}`;
    }).join("\n");
    
    return `Upcoming events:\n${events}`;
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
    return !!(config.calendar_id || config.provider === "google");
  }
}


