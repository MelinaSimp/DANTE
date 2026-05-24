// scripts/test-due-diligence-pipeline.ts
//
// End-to-end test: address-based due diligence with Google Maps
//
// Usage: npx tsx --env-file=.env.local scripts/test-due-diligence-pipeline.ts

import { runWorkflow } from "../lib/dante/workflow-runner";
import type { WorkflowDefinition } from "../lib/dante/workflow-types";

// ── Test 1: Address-based DD (Google Maps geocoding) ──
const addressPipeline: WorkflowDefinition = {
  id: "test-dd-address",
  workspace_id: "00000000-0000-0000-0000-000000000000",
  graph: {
    nodes: [
      {
        id: "trigger",
        type: "trigger_manual" as any,
        position: { x: 0, y: 0 },
        data: {
          step: { id: "trigger", type: "trigger_manual" as const, name: "Start", config: {} },
        },
      },
      {
        id: "dd",
        type: "due_diligence" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "dd",
            type: "due_diligence" as const,
            name: "Due Diligence",
            config: {
              address: "1600 Euclid Ave, Cleveland, OH 44115",
              drive_time_destinations: "Cleveland Hopkins Airport, Progressive Field, I-90 / I-71 interchange",
            },
          },
        },
      },
    ],
    edges: [{ id: "e1", source: "trigger", target: "dd" }],
  },
};

// ── Test 2: Coordinate-based DD (no Google Maps needed) ──
const coordPipeline: WorkflowDefinition = {
  id: "test-dd-coord",
  workspace_id: "00000000-0000-0000-0000-000000000000",
  graph: {
    nodes: [
      {
        id: "trigger",
        type: "trigger_manual" as any,
        position: { x: 0, y: 0 },
        data: {
          step: { id: "trigger", type: "trigger_manual" as const, name: "Start", config: {} },
        },
      },
      {
        id: "dd",
        type: "due_diligence" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "dd",
            type: "due_diligence" as const,
            name: "Due Diligence",
            config: {
              latitude: 41.4993,
              longitude: -81.6944,
              state_fips: "39",
              county_fips: "049",
              county_name: "CUYAHOGA",
            },
          },
        },
      },
    ],
    edges: [{ id: "e1", source: "trigger", target: "dd" }],
  },
};

async function main() {
  console.log("=== Due Diligence Pipeline Tests ===\n");

  // ── Test 1: Address-based ──
  console.log("--- Test 1: Address-based (Google Maps geocoding) ---");
  console.log('    Address: "1600 Euclid Ave, Cleveland, OH 44115"\n');

  try {
    const result = await runWorkflow(addressPipeline, {});
    const out = result.output as Record<string, Record<string, unknown>>;
    const dd = out?.dd;
    if (dd) {
      const loc = dd.location as Record<string, unknown> | null;
      console.log("  Location:", loc ? `${loc.formatted_address || "?"} (${loc.latitude}, ${loc.longitude})` : "no geocode");
      if (loc) {
        console.log(`    State: ${loc.state}, FIPS: ${loc.state_fips}-${loc.county_fips}, County: ${loc.county}`);
      }

      const emp = dd.employment as unknown[];
      console.log(`  Employment: ${emp?.length || 0} records`);
      console.log(`  Census: ${dd.census ? "OK" : "unavailable"}`);
      console.log(`  Flood zone: ${dd.flood_zone ? "OK" : "unavailable"}`);

      const epa = dd.epa as { toxics_facilities?: unknown[] };
      console.log(`  EPA toxics: ${epa?.toxics_facilities?.length || 0} facilities`);

      const nearby = dd.nearby_places as Array<Record<string, unknown>> | null;
      if (nearby && nearby.length > 0) {
        console.log(`\n  Nearby places (${nearby.length} total):`);
        nearby.slice(0, 8).forEach((p) => {
          const distMi = p.distance_meters ? `${(Number(p.distance_meters) / 1609.34).toFixed(1)} mi` : "?";
          console.log(`    [${String(p.type).replace(/_/g, " ")}] ${p.name} - ${distMi}${p.rating ? ` (${p.rating}/5)` : ""}`);
        });
      } else {
        console.log("  Nearby places: unavailable (no Google Maps key)");
      }

      const drives = dd.drive_times as Array<Record<string, unknown>> | null;
      if (drives && drives.length > 0) {
        console.log(`\n  Drive times:`);
        drives.forEach((d) => {
          console.log(`    ${d.destination}: ${d.duration_text} (${d.distance_text})`);
        });
      } else {
        console.log("  Drive times: unavailable (no Google Maps key or no destinations)");
      }

      if (Array.isArray(dd.errors) && dd.errors.length > 0) {
        console.log(`\n  Errors: ${(dd.errors as string[]).join(", ")}`);
      }
    }
  } catch (e) {
    console.log(`  Error: ${e instanceof Error ? e.message : e}`);
  }

  // ── Test 2: Coordinate-based ──
  console.log("\n--- Test 2: Coordinate-based (no Google Maps needed) ---");
  console.log("    Coords: 41.4993, -81.6944 (FIPS 39-049)\n");

  const result2 = await runWorkflow(coordPipeline, {});
  const out2 = result2.output as Record<string, Record<string, unknown>>;
  const dd2 = out2?.dd;
  if (dd2) {
    const loc = dd2.location as Record<string, unknown>;
    console.log(`  Location: ${loc?.latitude}, ${loc?.longitude} (FIPS: ${loc?.state_fips}-${loc?.county_fips})`);

    const emp = dd2.employment as unknown[];
    console.log(`  Employment: ${emp?.length || 0} records`);

    const epa = dd2.epa as { toxics_facilities?: unknown[] };
    console.log(`  EPA toxics: ${epa?.toxics_facilities?.length || 0} facilities`);
    console.log(`  Nearby places: ${(dd2.nearby_places as unknown[] | null)?.length || "unavailable"}`);
    console.log(`  Status: ${result2.status}`);
  }

  console.log("\n=== Tests Complete ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
