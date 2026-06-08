// Temporary diagnostic endpoint to test Google Places API directly.
// Hit /api/debug/places-test to see the raw API response.
// DELETE THIS after debugging.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Temporary debug endpoint -- no auth gate so we can hit it directly.
  // DELETE THIS FILE after diagnosing the Places API issue.

  // Use the env var directly (same as the real survey code's fallback)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || null;

  if (!apiKey) {
    return NextResponse.json({
      error: "No Google Maps API key found",
      checked: [
        "integration_connections (workspace google_maps provider)",
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

  // Extract lat/lng from geocode
  const geoData = geoResult as Record<string, unknown>;
  const results = geoData.results as Array<Record<string, unknown>> | undefined;
  const location = results?.[0]?.geometry as
    | { location: { lat: number; lng: number } }
    | undefined;
  const lat = location?.location?.lat;
  const lng = location?.location?.lng;

  // Test 2: Places Nearby Search for restaurants
  let placesResult: unknown = { skipped: "no lat/lng from geocode" };
  if (lat && lng) {
    const placesUrl =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&radius=4828&type=restaurant&key=${apiKey}`;
    try {
      const placesRes = await fetch(placesUrl);
      const raw = await placesRes.json();
      // Return status + first 3 results (truncated) for privacy
      placesResult = {
        status: raw.status,
        error_message: raw.error_message || null,
        result_count: raw.results?.length || 0,
        first_3: (raw.results || []).slice(0, 3).map((r: Record<string, unknown>) => ({
          name: r.name,
          vicinity: r.vicinity,
          place_id: r.place_id,
        })),
      };
    } catch (err) {
      placesResult = { fetch_error: String(err) };
    }
  }

  return NextResponse.json({
    test_address: testAddress,
    api_key_source: "env:GOOGLE_MAPS_API_KEY",
    api_key_prefix: apiKey.slice(0, 8) + "...",
    geocode: {
      status: geoData.status,
      error_message: geoData.error_message || null,
      lat,
      lng,
      formatted_address: results?.[0]?.formatted_address,
    },
    places_nearby: placesResult,
  });
}
