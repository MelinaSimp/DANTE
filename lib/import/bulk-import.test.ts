import { describe, it, expect } from "vitest";
import { parseCSV } from "./bulk-import";

describe("parseCSV", () => {
  it("parses simple CSV", () => {
    const csv = "Name,Email,Phone\nJohn Doe,john@example.com,555-1234\nJane Smith,jane@example.com,555-5678";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("John Doe");
    expect(rows[0].email).toBe("john@example.com");
    expect(rows[1].name).toBe("Jane Smith");
  });

  it("handles quoted fields with commas", () => {
    const csv = 'Name,Address\n"Smith, John","123 Main St, Suite 100"';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Smith, John");
    expect(rows[0].address).toBe("123 Main St, Suite 100");
  });

  it("handles escaped quotes", () => {
    const csv = 'Name,Notes\nJohn,"""Hello"" he said"';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('"Hello" he said');
  });

  it("normalizes headers to snake_case", () => {
    const csv = "Full Name,Email Address,Phone Number\nAlice,alice@test.com,555-0000";
    const rows = parseCSV(csv);
    expect(rows[0]).toHaveProperty("full_name", "Alice");
    expect(rows[0]).toHaveProperty("email_address", "alice@test.com");
    expect(rows[0]).toHaveProperty("phone_number", "555-0000");
  });

  it("handles Windows line endings", () => {
    const csv = "Name,Email\r\nAlice,a@b.com\r\nBob,b@c.com";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it("skips empty lines", () => {
    const csv = "Name,Email\nAlice,a@b.com\n\nBob,b@c.com\n";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for header-only CSV", () => {
    const csv = "Name,Email";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseCSV("")).toHaveLength(0);
  });

  it("handles extra columns gracefully", () => {
    const csv = "Name,Email\nAlice,a@b.com,extrafield";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
    expect(rows[0].email).toBe("a@b.com");
  });

  it("handles missing columns gracefully", () => {
    const csv = "Name,Email,Phone\nAlice";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
    expect(rows[0].email).toBeUndefined();
  });

  it("trims whitespace from values", () => {
    const csv = "Name,Email\n  Alice  ,  alice@test.com  ";
    const rows = parseCSV(csv);
    expect(rows[0].name).toBe("Alice");
    expect(rows[0].email).toBe("alice@test.com");
  });

  it("parses property CSV with multiple columns", () => {
    const csv =
      "Address,City,State,Zip,Type,Sqft,Year Built,List Price\n" +
      "4821 Maple Ridge Dr,Willoughby,OH,44094,retail,12000,2004,$1500000\n" +
      "1200 Cedar Point Rd,Sandusky,OH,44870,office,18000,1998,$2100000";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].address).toBe("4821 Maple Ridge Dr");
    expect(rows[0].city).toBe("Willoughby");
    expect(rows[0].state).toBe("OH");
    expect(rows[0].sqft).toBe("12000");
    expect(rows[1].type).toBe("office");
  });
});
