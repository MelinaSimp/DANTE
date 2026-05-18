// lib/site-scan/adapters/types.ts
// Core interfaces for the county adapter system.

export interface ParcelSummary {
  parcel_number: string;
  address: string;
  city: string;
  state: string;
  county: string;
  centroid: { lat: number; lng: number };
  zoning_class: string;
  zoning_description?: string;
  land_area_acres: number;
  assessed_value_total?: number;
  land_use_code?: string;
  land_use_description?: string;
}

export interface AuditorRecord {
  parcel_number: string;
  owner_name: string;
  address: string;
  city: string;
  zip: string;
  zoning_class: string;
  zoning_description: string;
  land_use_code: string;
  land_use_description: string;
  land_area_sf: number;
  land_area_acres: number;
  assessed_value_land: number;
  assessed_value_building: number;
  assessed_value_total: number;
  market_value_total: number;
  tax_district: string;
  millage_rate: number;
  annual_tax_estimate: number;
  last_sale_date: string | null;
  last_sale_price: number | null;
  year_built: number | null;
  building_sf: number | null;
  overlay_districts?: string[];
  tax_year?: number;

  // CRA / abatement (populated by enrichment, not auditor)
  cra_eligible?: boolean;
  cra_district_name?: string;
  abatement_active?: boolean;
  abatement_percentage?: number;
  abatement_expiry?: string;

  // Tax estimation (derived)
  estimated_annual_tax?: number;
  estimated_abated_tax?: number;
}

export interface CountyAdapterConfig {
  county: string;
  state: string;
  serviceUrl: string;
  layerId: number;
  spatialReference: number;
  fieldMap: Record<string, string>;
  zoningClassMap?: Record<string, string[]>;
}

export interface CountyAdapter {
  config: CountyAdapterConfig;

  searchParcels(params: {
    bounds?: { north: number; south: number; east: number; west: number };
    center?: { lat: number; lng: number };
    radiusMeters?: number;
    zoning?: string[];
    acreageMin?: number;
    acreageMax?: number;
    landUse?: string[];
    maxResults?: number;
  }): Promise<ParcelSummary[]>;

  getParcelDetail(parcelNumber: string): Promise<AuditorRecord>;
}
