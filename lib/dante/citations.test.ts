import { describe, it, expect } from "vitest";
import { tokenize, buildCitationMap, type Token } from "./citations";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a minimal trace entry matching the shape buildCitationMap expects. */
function traceEntry(
  step_name: string,
  output: unknown,
  overrides?: { step_id?: string; status?: string },
) {
  return {
    step_id: overrides?.step_id ?? "s1",
    step_name,
    status: overrides?.status ?? "complete",
    output,
  };
}

// ---------------------------------------------------------------------------
// tokenize()
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  // 1. Empty string
  it("returns a single empty text token for empty string", () => {
    const tokens = tokenize("");
    expect(tokens).toEqual([{ kind: "text", value: "" }]);
  });

  // 2. Plain text with no markers
  it("returns a single text token for plain text with no markers", () => {
    const tokens = tokenize("Hello world, no citations here.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({
      kind: "text",
      value: "Hello world, no citations here.",
    });
  });

  // 3. Single vault marker splits correctly
  it("splits text around a single vault marker [v1]", () => {
    const tokens = tokenize("Before [v1] after");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ kind: "text", value: "Before " });
    expect(tokens[1]).toEqual({
      kind: "citation",
      raw: "[v1]",
      key: "v1",
      type: "vault",
    });
    expect(tokens[2]).toEqual({ kind: "text", value: " after" });
  });

  // 4. Multiple vault markers
  it("handles multiple vault markers in one string", () => {
    const tokens = tokenize("Start [v1] middle [v2] end");
    expect(tokens).toHaveLength(5);

    const citations = tokens.filter((t) => t.kind === "citation");
    expect(citations).toHaveLength(2);
    expect((citations[0] as Extract<Token, { kind: "citation" }>).key).toBe("v1");
    expect((citations[1] as Extract<Token, { kind: "citation" }>).key).toBe("v2");

    const texts = tokens.filter((t) => t.kind === "text");
    expect(texts).toHaveLength(3);
    expect((texts[0] as Extract<Token, { kind: "text" }>).value).toBe("Start ");
    expect((texts[1] as Extract<Token, { kind: "text" }>).value).toBe(" middle ");
    expect((texts[2] as Extract<Token, { kind: "text" }>).value).toBe(" end");
  });

  // 5. Memory marker
  it("recognizes memory marker [mem:abcd1234] as type memory", () => {
    const tokens = tokenize("Recall [mem:abcd1234] that detail.");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.type).toBe("memory");
    expect(cite.key).toBe("mem:abcd1234");
    expect(cite.raw).toBe("[mem:abcd1234]");
  });

  // 6. Regulatory marker
  it("recognizes regulatory marker [reg:42] as type regulatory", () => {
    const tokens = tokenize("Per SEC [reg:42] guidance.");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.type).toBe("regulatory");
    expect(cite.key).toBe("reg:42");
    expect(cite.raw).toBe("[reg:42]");
  });

  // 7. Site scan marker
  it("recognizes site scan marker [ss:3] as type site_scan", () => {
    const tokens = tokenize("The parcel [ss:3] is zoned residential.");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.type).toBe("site_scan");
    expect(cite.key).toBe("ss:3");
    expect(cite.raw).toBe("[ss:3]");
  });

  // 8. Adjacent markers with no whitespace between them
  it("handles adjacent markers [v1][v2][mem:12345678]", () => {
    const tokens = tokenize("[v1][v2][mem:12345678]");
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t.kind === "citation")).toBe(true);

    const keys = tokens.map(
      (t) => (t as Extract<Token, { kind: "citation" }>).key,
    );
    expect(keys).toEqual(["v1", "v2", "mem:12345678"]);
  });

  // 9. Markers at start and end of string
  it("handles marker at the very start of the string", () => {
    const tokens = tokenize("[v1] starts here");
    expect(tokens[0]).toEqual({
      kind: "citation",
      raw: "[v1]",
      key: "v1",
      type: "vault",
    });
    expect(tokens[1]).toEqual({ kind: "text", value: " starts here" });
  });

  it("handles marker at the very end of the string", () => {
    const tokens = tokenize("ends here [reg:5]");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toEqual({ kind: "text", value: "ends here " });
    expect(tokens[1]).toEqual({
      kind: "citation",
      raw: "[reg:5]",
      key: "reg:5",
      type: "regulatory",
    });
  });

  // 10. Mixed marker types in one string
  it("handles all four marker types in one string", () => {
    const input =
      "Vault [v1], memory [mem:aabbccdd], regulatory [reg:2], site [ss:7].";
    const tokens = tokenize(input);
    const citations = tokens.filter((t) => t.kind === "citation") as Array<
      Extract<Token, { kind: "citation" }>
    >;

    expect(citations).toHaveLength(4);
    expect(citations.map((c) => c.type)).toEqual([
      "vault",
      "memory",
      "regulatory",
      "site_scan",
    ]);
    expect(citations.map((c) => c.key)).toEqual([
      "v1",
      "mem:aabbccdd",
      "reg:2",
      "ss:7",
    ]);
  });

  // 11. Non-citation brackets are left as plain text
  it("leaves [Note], [1], [something] as plain text", () => {
    const tokens = tokenize(
      "Footnote [1] and [Note] and [something] are not markers.",
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("text");
    expect((tokens[0] as Extract<Token, { kind: "text" }>).value).toBe(
      "Footnote [1] and [Note] and [something] are not markers.",
    );
  });

  it("leaves markdown-style links as plain text", () => {
    const tokens = tokenize("[link](https://example.com)");
    // "link" doesn't match any pattern, so the whole string is text
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("text");
  });

  // 12. High-numbered markers
  it("recognizes high-numbered vault markers [v999]", () => {
    const tokens = tokenize("See [v999].");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe("v999");
    expect(cite.type).toBe("vault");
  });

  it("recognizes high-numbered regulatory markers [reg:100]", () => {
    const tokens = tokenize("Under [reg:100],");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe("reg:100");
    expect(cite.type).toBe("regulatory");
  });

  it("recognizes high-numbered site scan markers [ss:50]", () => {
    const tokens = tokenize("Parcel [ss:50].");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe("ss:50");
    expect(cite.type).toBe("site_scan");
  });

  // 13. Memory markers with varying hex lengths
  it("recognizes 4-char hex memory marker [mem:abcd]", () => {
    const tokens = tokenize("Short [mem:abcd] ref.");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe("mem:abcd");
    expect(cite.type).toBe("memory");
  });

  it("recognizes 32-char hex memory marker", () => {
    const hex32 = "abcdef1234567890abcdef1234567890";
    const tokens = tokenize(`Full [mem:${hex32}] uuid.`);
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe(`mem:${hex32}`);
    expect(cite.type).toBe("memory");
  });

  it("recognizes 8-char hex memory marker (standard short_id)", () => {
    const tokens = tokenize("Ref [mem:1a2b3c4d].");
    const cite = tokens.find((t) => t.kind === "citation") as Extract<
      Token,
      { kind: "citation" }
    >;
    expect(cite).toBeDefined();
    expect(cite.key).toBe("mem:1a2b3c4d");
  });

  // 14. Invalid memory markers stay as text
  it("leaves too-short hex memory marker [mem:abc] as text", () => {
    const tokens = tokenize("Invalid [mem:abc] ref.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("text");
  });

  it("leaves too-long hex memory marker (33 chars) as text", () => {
    const hex33 = "abcdef1234567890abcdef12345678901"; // 33 hex chars
    const tokens = tokenize(`Bad [mem:${hex33}] ref.`);
    // The regex only matches 4-32 hex chars; 33 chars should not match.
    const citations = tokens.filter((t) => t.kind === "citation");
    expect(citations).toHaveLength(0);
  });

  it("leaves memory marker with non-hex chars [mem:ghij1234] as text", () => {
    const tokens = tokenize("Bad [mem:ghij1234] ref.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("text");
  });

  it("leaves memory marker with uppercase hex [mem:ABCD1234] as text", () => {
    // The regex requires lowercase a-f
    const tokens = tokenize("Upper [mem:ABCD1234] ref.");
    const citations = tokens.filter((t) => t.kind === "citation");
    expect(citations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildCitationMap()
// ---------------------------------------------------------------------------

describe("buildCitationMap", () => {
  // 1. Empty/undefined trace
  it("returns empty maps for undefined trace", () => {
    const map = buildCitationMap(undefined);
    expect(map.vault).toEqual({});
    expect(map.memory).toEqual({});
    expect(map.regulatory).toEqual({});
    expect(map.site_scan).toEqual({});
  });

  it("returns empty maps for empty trace array", () => {
    const map = buildCitationMap([]);
    expect(map.vault).toEqual({});
    expect(map.memory).toEqual({});
    expect(map.regulatory).toEqual({});
    expect(map.site_scan).toEqual({});
  });

  // 2. Vault citation populates vault map with key stripped of brackets
  it("populates vault map from vault_cite trace entry", () => {
    const trace = [
      traceEntry("agent -> vault_cite", {
        result: {
          citations: [
            {
              marker: "[v1]",
              quote: "Cash allocation shall not exceed 5%",
              source: "Client IPS 2025",
              page: 3,
              document_id: "doc-abc-123",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.vault)).toEqual(["v1"]);
    expect(map.vault["v1"].marker).toBe("[v1]");
    expect(map.vault["v1"].quote).toBe("Cash allocation shall not exceed 5%");
    expect(map.vault["v1"].source).toBe("Client IPS 2025");
    expect(map.vault["v1"].page).toBe(3);
    expect(map.vault["v1"].document_id).toBe("doc-abc-123");
  });

  // 3. Memory search populates memory map with short_id = first 8 chars
  it("populates memory map from memory_search trace entry", () => {
    const fullId = "abcd1234-5678-9abc-def0-111122223333";
    const trace = [
      traceEntry("agent -> memory_search", {
        result: {
          hits: [
            {
              id: fullId,
              kind: "fact",
              content: "Client prefers bond ladders",
              source_kind: "conversation",
              source_id: "conv-42",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    const expectedKey = `mem:${fullId.slice(0, 8)}`;
    expect(Object.keys(map.memory)).toEqual([expectedKey]);
    expect(map.memory[expectedKey].id).toBe(fullId);
    expect(map.memory[expectedKey].short_id).toBe("abcd1234");
    expect(map.memory[expectedKey].kind).toBe("fact");
    expect(map.memory[expectedKey].content).toBe(
      "Client prefers bond ladders",
    );
    expect(map.memory[expectedKey].source_kind).toBe("conversation");
    expect(map.memory[expectedKey].source_id).toBe("conv-42");
  });

  // 4. Regulatory search populates regulatory map with 1-based indices
  it("populates regulatory map with 1-based indices from regulatory_search", () => {
    const trace = [
      traceEntry("agent -> regulatory_search", {
        result: {
          hits: [
            {
              authority: "SEC",
              source_kind: "press_release",
              source_url: "https://sec.gov/press/1",
              title: "SEC Press Release 1",
              content: "Fiduciary duty...",
              published_at: "2025-01-15",
            },
            {
              authority: "IRS",
              source_kind: "rev_ruling",
              source_url: "https://irs.gov/ruling/2",
              title: "IRS Revenue Ruling",
              content: "Tax treatment of...",
              published_at: null,
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.regulatory)).toEqual(["reg:1", "reg:2"]);

    expect(map.regulatory["reg:1"].marker).toBe("[reg:1]");
    expect(map.regulatory["reg:1"].index).toBe(1);
    expect(map.regulatory["reg:1"].authority).toBe("SEC");
    expect(map.regulatory["reg:1"].source_url).toBe("https://sec.gov/press/1");
    expect(map.regulatory["reg:1"].title).toBe("SEC Press Release 1");
    expect(map.regulatory["reg:1"].published_at).toBe("2025-01-15");

    expect(map.regulatory["reg:2"].marker).toBe("[reg:2]");
    expect(map.regulatory["reg:2"].index).toBe(2);
    expect(map.regulatory["reg:2"].authority).toBe("IRS");
    expect(map.regulatory["reg:2"].published_at).toBeNull();
  });

  // 5. Site scan populates site_scan map
  it("populates site_scan map from site_scan_search trace entry", () => {
    const trace = [
      traceEntry("agent -> site_scan_search", {
        result: {
          citations: [
            {
              marker: "[ss:1]",
              index: 1,
              parcel_number: "12-34-56-001",
              address: "123 Main St",
              county: "Westmoreland",
              state: "PA",
              source: "Westmoreland County Auditor",
              source_url: "https://county.gov/parcel/123",
              accessed_at: "2025-04-01T12:00:00Z",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.site_scan)).toEqual(["ss:1"]);
    expect(map.site_scan["ss:1"].marker).toBe("[ss:1]");
    expect(map.site_scan["ss:1"].index).toBe(1);
    expect(map.site_scan["ss:1"].parcel_number).toBe("12-34-56-001");
    expect(map.site_scan["ss:1"].address).toBe("123 Main St");
    expect(map.site_scan["ss:1"].county).toBe("Westmoreland");
    expect(map.site_scan["ss:1"].state).toBe("PA");
    expect(map.site_scan["ss:1"].source).toBe("Westmoreland County Auditor");
    expect(map.site_scan["ss:1"].source_url).toBe(
      "https://county.gov/parcel/123",
    );
    expect(map.site_scan["ss:1"].accessed_at).toBe("2025-04-01T12:00:00Z");
  });

  // 6. Later vault_cite call wins on key collision
  it("later vault_cite call overwrites earlier one on same key", () => {
    const trace = [
      traceEntry(
        "agent -> vault_cite",
        {
          result: {
            citations: [
              {
                marker: "[v1]",
                quote: "old quote",
                source: "Old Doc",
                page: 1,
              },
            ],
          },
        },
        { step_id: "s1" },
      ),
      traceEntry(
        "agent -> vault_cite",
        {
          result: {
            citations: [
              {
                marker: "[v1]",
                quote: "new quote",
                source: "New Doc",
                page: 7,
              },
            ],
          },
        },
        { step_id: "s2" },
      ),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.vault)).toEqual(["v1"]);
    expect(map.vault["v1"].quote).toBe("new quote");
    expect(map.vault["v1"].source).toBe("New Doc");
    expect(map.vault["v1"].page).toBe(7);
  });

  // 7. Mixed trace with all four citation types
  it("builds a complete map from a trace with all four citation types", () => {
    const trace = [
      traceEntry("agent -> vault_cite", {
        result: {
          citations: [
            {
              marker: "[v1]",
              quote: "IPS allocation",
              source: "IPS",
              page: 2,
              document_id: "d1",
            },
            {
              marker: "[v2]",
              quote: "Fee schedule",
              source: "Fee Agreement",
              page: null,
            },
          ],
        },
      }),
      traceEntry("agent -> memory_search", {
        result: {
          hits: [
            {
              id: "aaaa1111-2222-3333-4444-555566667777",
              kind: "episode",
              content: "Client wants 60/40",
            },
          ],
        },
      }),
      traceEntry("agent -> regulatory_search", {
        result: {
          hits: [
            {
              authority: "DOL",
              source_kind: "guidance",
              source_url: "https://dol.gov/1",
              title: "DOL Guidance",
              content: "Fiduciary requirements",
              published_at: "2024-12-01",
            },
          ],
        },
      }),
      traceEntry("agent -> site_scan_search", {
        result: {
          citations: [
            {
              marker: "[ss:1]",
              index: 1,
              parcel_number: "99-00-11",
              address: "456 Oak Ave",
              county: "Allegheny",
              state: "PA",
              source: "Allegheny County",
              source_url: "https://allegheny.gov/p/99",
              accessed_at: "2025-05-01T00:00:00Z",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.vault)).toEqual(["v1", "v2"]);
    expect(Object.keys(map.memory)).toEqual(["mem:aaaa1111"]);
    expect(Object.keys(map.regulatory)).toEqual(["reg:1"]);
    expect(Object.keys(map.site_scan)).toEqual(["ss:1"]);

    // Spot-check cross-type isolation
    expect(map.vault["v1"].source).toBe("IPS");
    expect(map.vault["v2"].page).toBeNull();
    expect(map.memory["mem:aaaa1111"].kind).toBe("episode");
    expect(map.regulatory["reg:1"].authority).toBe("DOL");
    expect(map.site_scan["ss:1"].county).toBe("Allegheny");
  });

  // 8. Trace entry with non-object output is skipped gracefully
  it("skips trace entries whose output is a string", () => {
    const trace = [
      traceEntry("agent -> vault_cite", "not an object"),
    ];
    const map = buildCitationMap(trace);
    expect(map.vault).toEqual({});
  });

  it("skips trace entries whose output is null", () => {
    const trace = [
      traceEntry("agent -> vault_cite", null),
    ];
    const map = buildCitationMap(trace);
    expect(map.vault).toEqual({});
  });

  it("skips trace entries whose output.result is a number", () => {
    const trace = [
      traceEntry("agent -> vault_cite", { result: 42 }),
    ];
    const map = buildCitationMap(trace);
    expect(map.vault).toEqual({});
  });

  // 9. Entry with wrong step_name doesn't populate the wrong map
  it("does not populate vault map when step_name is memory_search", () => {
    // Memory search output shape but step_name says memory_search
    // -- the citations array should NOT land in vault
    const trace = [
      traceEntry("agent -> memory_search", {
        result: {
          citations: [
            {
              marker: "[v1]",
              quote: "should not appear",
              source: "Wrong",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);
    expect(map.vault).toEqual({});
  });

  it("does not populate memory map when step_name is vault_cite", () => {
    const trace = [
      traceEntry("agent -> vault_cite", {
        result: {
          hits: [
            {
              id: "bbbb2222-3333-4444-5555-666677778888",
              kind: "fact",
              content: "should not appear",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);
    expect(map.memory).toEqual({});
  });

  it("does not populate regulatory map when step_name is site_scan_search", () => {
    const trace = [
      traceEntry("agent -> site_scan_search", {
        result: {
          hits: [
            {
              authority: "SEC",
              source_kind: "press_release",
              source_url: "https://sec.gov/1",
              title: "Misplaced",
              content: "Should not appear",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);
    expect(map.regulatory).toEqual({});
  });

  // 10. Vault citation with missing marker field is skipped
  it("skips vault citation entries that have no marker field", () => {
    const trace = [
      traceEntry("agent -> vault_cite", {
        result: {
          citations: [
            { quote: "orphan quote", source: "Doc" },
            {
              marker: "[v2]",
              quote: "valid quote",
              source: "Good Doc",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    // Only [v2] should be present; the markerless entry is skipped
    expect(Object.keys(map.vault)).toEqual(["v2"]);
    expect(map.vault["v2"].quote).toBe("valid quote");
  });

  // -- Additional edge cases -----------------------------------------------

  it("skips site_scan citations that have no marker field", () => {
    const trace = [
      traceEntry("agent -> site_scan_search", {
        result: {
          citations: [
            { parcel_number: "orphan", address: "nowhere" },
            {
              marker: "[ss:2]",
              index: 2,
              parcel_number: "55-66",
              address: "789 Elm",
              county: "Butler",
              state: "PA",
              source: "Butler County",
              source_url: "https://butler.gov",
              accessed_at: "2025-03-01",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);
    expect(Object.keys(map.site_scan)).toEqual(["ss:2"]);
  });

  it("skips regulatory hits that have no source_url", () => {
    const trace = [
      traceEntry("agent -> regulatory_search", {
        result: {
          hits: [
            {
              authority: "SEC",
              source_kind: "press_release",
              // source_url intentionally missing
              title: "No URL",
              content: "Should be skipped",
            },
            {
              authority: "IRS",
              source_kind: "rev_ruling",
              source_url: "https://irs.gov/valid",
              title: "Has URL",
              content: "Included",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    // The first hit is skipped (no source_url), so the IRS entry gets index 1
    expect(Object.keys(map.regulatory)).toEqual(["reg:1"]);
    expect(map.regulatory["reg:1"].authority).toBe("IRS");
  });

  it("skips memory hits that have no id", () => {
    const trace = [
      traceEntry("agent -> memory_search", {
        result: {
          hits: [
            { kind: "fact", content: "no id here" },
            {
              id: "cccc3333-1111-2222-3333-444455556666",
              kind: "summary",
              content: "has id",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    expect(Object.keys(map.memory)).toEqual(["mem:cccc3333"]);
    expect(map.memory["mem:cccc3333"].kind).toBe("summary");
  });

  it("uses defaults for optional fields (quote, source, kind, etc.)", () => {
    const trace = [
      traceEntry("agent -> vault_cite", {
        result: {
          citations: [
            { marker: "[v1]" }, // no quote, no source, no page, no document_id
          ],
        },
      }),
      traceEntry("agent -> memory_search", {
        result: {
          hits: [
            { id: "dddd4444-0000-0000-0000-000000000000" }, // no kind, no content
          ],
        },
      }),
      traceEntry("agent -> regulatory_search", {
        result: {
          hits: [
            { source_url: "https://example.gov" }, // minimal
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);

    // Vault defaults
    expect(map.vault["v1"].quote).toBe("");
    expect(map.vault["v1"].source).toBe("(untitled)");
    expect(map.vault["v1"].page).toBeNull();
    expect(map.vault["v1"].document_id).toBeUndefined();

    // Memory defaults
    expect(map.memory["mem:dddd4444"].kind).toBe("fact");
    expect(map.memory["mem:dddd4444"].content).toBe("");
    expect(map.memory["mem:dddd4444"].source_kind).toBeNull();
    expect(map.memory["mem:dddd4444"].source_id).toBeNull();

    // Regulatory defaults
    expect(map.regulatory["reg:1"].authority).toBe("OTHER");
    expect(map.regulatory["reg:1"].source_kind).toBe("guidance");
    expect(map.regulatory["reg:1"].title).toBe("(untitled)");
    expect(map.regulatory["reg:1"].content).toBe("");
    expect(map.regulatory["reg:1"].published_at).toBeNull();
  });

  it("recognizes void_analysis step_name for site_scan citations", () => {
    const trace = [
      traceEntry("agent -> void_analysis", {
        result: {
          citations: [
            {
              marker: "[ss:1]",
              index: 1,
              parcel_number: "77-88",
              address: "100 Void Ln",
              county: "Erie",
              state: "PA",
              source: "Erie County",
              source_url: "https://erie.gov/parcel",
              accessed_at: "2025-06-01",
            },
          ],
        },
      }),
    ];
    const map = buildCitationMap(trace);
    expect(Object.keys(map.site_scan)).toEqual(["ss:1"]);
    expect(map.site_scan["ss:1"].county).toBe("Erie");
  });
});
