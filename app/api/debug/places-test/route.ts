// Temporary diagnostic endpoint to test Google Places API directly.
// Hit /api/debug/places-test to see the raw API response.
// DELETE THIS after debugging.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  // Temporary debug endpoint -- no auth gate so we can hit it directly.
  // DELETE THIS FILE after diagnosing the Places API issue.

  // Check integration_connections for any workspace's google_maps key
  let apiKey: string | null = null;
  let keySource = "none";
  try {
    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("credentials")
      .eq("provider", "google_maps")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    if (conn) {
      const creds = conn.credentials as Record<string, string>;
      if (creds.api_key) {
        apiKey = creds.api_key;
        keySource = "integration_connections";
      }
    }
  } catch { /* fall through */ }

  if (!apiKey) {
    apiKey = process.env.GOOGLE_MAPS_API_KEY || null;
    if (apiKey) keySource = "env:GOOGLE_MAPS_API_KEY";
  }

  if (!apiKey) {
    return NextResponse.json({
      error: "No Google Maps API key found",
      checked: [
        "integration_connections (google_maps provider)",
        "GOOGLE_MAPS_API_KEY env var",
      ],
    });
  }

  // Test 1: Geocode a known address
  const testAddress = "38000 Euclid Ave, Willoughby, OH 44094";
  const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(testAddress)}&key=${apiKey}`;
  let geoResult: unknown;
  try {
    const geoRes = await fetch(geoUrl);
    geoResult = await geoRes.json();
  } catch (err) {
    geoResult = { fetch_error: String(err) };
  }

  const geoData = geoResult as Record<string, unknown>;
  const results = geoData.results as Array<Record<string, unknown>> | undefined;
  const location = results?.[0]?.geometry as
    | { location: { lat: number; lng: number } }
    | undefined;
  const lat = location?.location?.lat;
  const lng = location?.location?.lng;

  // Test 2: Places API (New) -- Nearby Search for restaurants
  let placesNewResult: unknown = { skipped: "no lat/lng from geocode" };
  if (lat && lng) {
    try {
      const placesRes = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount",
          },
          body: JSON.stringify({
            includedTypes: ["restaurant"],
            maxResultCount: 5,
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: 4828.0,
              },
            },
          }),
        },
      );
      const raw = await placesRes.json();
      if (raw.error) {
        placesNewResult = {
          api: "Places API (New)",
          error: raw.error,
        };
      } else {
        const places = raw.places || [];
        placesNewResult = {
          api: "Places API (New)",
          result_count: places.length,
          first_3: places.slice(0, 3).map((r: Record<string, unknown>) => ({
            name: (r.displayName as { text: string } | undefined)?.text,
            address: r.formattedAddress,
            id: r.id,
          })),
        };
      }
    } catch (err) {
      placesNewResult = { fetch_error: String(err) };
    }
  }

  return NextResponse.json({
    test_address: testAddress,
    api_key_source: keySource,
    api_key_prefix: apiKey.slice(0, 12) + "...",
    geocode: {
      status: geoData.status,
      error_message: geoData.error_message || null,
      lat,
      lng,
      formatted_address: results?.[0]?.formatted_address,
    },
    places_nearby_new: placesNewResult,
  });
}
