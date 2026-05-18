// lib/site-scan/enrichment/crexi.ts
// Crexi listings integration — stub pending API key approval.

export interface ListingResult {
  listing_id: string;
  address: string;
  lat: number;
  lng: number;
  property_type: string;
  square_feet: number | null;
  acreage: number | null;
  asking_price: number | null;
  listing_broker: string;
  source_url: string;
}

export async function searchListings(_params: {
  lat: number;
  lng: number;
  radiusMiles: number;
  propertyType?: string;
  sfMin?: number;
  sfMax?: number;
}): Promise<ListingResult[]> {
  // TODO: Implement when Crexi API key is approved.
  // For now, return empty — the tool handler generates
  // helpful fallback links to Crexi/LoopNet.
  return [];
}
