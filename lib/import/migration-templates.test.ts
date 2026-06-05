import { describe, it, expect } from "vitest";
import { detectCRMSource, MIGRATION_TEMPLATES } from "./migration-templates";

describe("detectCRMSource", () => {
  it("detects Salesforce from signature columns", () => {
    const headers = [
      "Full Name",
      "Email",
      "Account Name",
      "Mailing State/Province",
      "Lead Status",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("salesforce");
  });

  it("detects HubSpot from signature columns", () => {
    const headers = [
      "First name",
      "Last name",
      "Email",
      "Lifecycle Stage",
      "HubSpot Owner",
      "Create Date",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("hubspot");
  });

  it("detects Brokermint from signature columns", () => {
    const headers = [
      "Contact Name",
      "Email",
      "Contact Type",
      "Brokermint ID",
      "Commission",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("brokermint");
  });

  it("detects Apto/Buildout from signature columns", () => {
    const headers = [
      "Name",
      "Email",
      "Apto ID",
      "Contact Type",
      "Building Size",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("apto");
  });

  it("detects Reonomy from signature columns", () => {
    const headers = [
      "Address",
      "City",
      "Reonomy ID",
      "Building Area",
      "Tax Amount",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("reonomy");
  });

  it("returns null for generic headers with no CRM signals", () => {
    const headers = ["Name", "Email", "Phone", "City", "State"];
    const result = detectCRMSource(headers);
    expect(result).toBeNull();
  });

  it("is case-insensitive", () => {
    const headers = [
      "FULL NAME",
      "email",
      "account name",
      "MAILING STATE/PROVINCE",
      "lead status",
    ];
    const result = detectCRMSource(headers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("salesforce");
  });

  it("requires at least 40% of signature columns to match", () => {
    // Only 1 out of 5 Salesforce signatures
    const headers = ["Name", "Email", "Account Name"];
    const result = detectCRMSource(headers);
    // Account Name alone = 1/5 = 20% -- below threshold
    expect(result).toBeNull();
  });

  it("all templates have required fields", () => {
    for (const t of MIGRATION_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.exportInstructions.length).toBeGreaterThan(0);
      expect(["contacts", "properties", "both"]).toContain(t.entity);
    }
  });
});
