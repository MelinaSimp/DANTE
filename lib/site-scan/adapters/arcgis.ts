// lib/site-scan/adapters/arcgis.ts
// Generic ArcGIS REST adapter — handles any county/state that
// publishes parcels through ArcGIS REST services.

import type {
  CountyAdapter,
  CountyAdapterConfig,
  ParcelSummary,
  AuditorRecord,
} from "./types";

export class ArcGISCountyAdapter implements CountyAdapter {
  constructor(public config: CountyAdapterConfig) {}

  async searchParcels(params: {
    center?: { lat: number; lng: number };
    radiusMeters?: number;
    zoning?: string[];
    acreageMin?: number;
    acreageMax?: number;
    landUse?: string[];
    maxResults?: number;
  }): Promise<ParcelSummary[]> {
    const { serviceUrl, layerId, fieldMap } = this.config;
    const url = new URL(`${serviceUrl}/${layerId}/query`);

    const clauses: string[] = [];
    if (params.zoning?.length) {
      const quoted = params.zoning.map((z) => `'${z.replace(/'/g, "''")}'`).join(",");
      clauses.push(`${fieldMap.zoning_class} IN (${quoted})`);
    }
    if (params.landUse?.length) {
      const quoted = params.landUse.map((l) => `'${l.replace(/'/g, "''")}'`).join(",");
      clauses.push(`${fieldMap.land_use_code} IN (${quoted})`);
    }
    if (params.acreageMin != null && fieldMap.land_area_sf) {
      clauses.push(`${fieldMap.land_area_sf} >= ${params.acreageMin * 43560}`);
    }
    if (params.acreageMax != null && fieldMap.land_area_sf) {
      clauses.push(`${fieldMap.land_area_sf} <= ${params.acreageMax * 43560}`);
    }

    url.searchParams.set("where", clauses.length ? clauses.join(" AND ") : "1=1");
    url.searchParams.set("outFields", Object.values(fieldMap).join(","));
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultRecordCount", String(params.maxResults ?? 25));

    if (params.center && params.radiusMeters) {
      url.searchParams.set("geometryType", "esriGeometryPoint");
      url.searchParams.set(
        "geometry",
        `${params.center.lng},${params.center.lat}`,
      );
      url.searchParams.set("distance", String(params.radiusMeters));
      url.searchParams.set("units", "esriSRUnit_Meter");
      url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`[arcgis] search failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    if (json.error) {
      console.warn(`[arcgis] search error:`, json.error);
      return [];
    }

    return (json.features ?? []).map((f: any) => this.mapFeature(f));
  }

  async getParcelDetail(parcelNumber: string): Promise<AuditorRecord> {
    const { serviceUrl, layerId, fieldMap } = this.config;
    const url = new URL(`${serviceUrl}/${layerId}/query`);
    url.searchParams.set(
      "where",
      `${fieldMap.parcel_number}='${parcelNumber.replace(/'/g, "''")}'`,
    );
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`ArcGIS query failed: ${res.status}`);
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) throw new Error(`Parcel ${parcelNumber} not found`);

    return this.mapDetail(feature);
  }

  private mapFeature(feature: any): ParcelSummary {
    const a = feature.attributes;
    const fm = this.config.fieldMap;
    const geom = feature.geometry;
    const centroid = geom?.rings
      ? this.polygonCentroid(geom.rings)
      : { lat: geom?.y ?? 0, lng: geom?.x ?? 0 };

    return {
      parcel_number: String(a[fm.parcel_number] ?? ""),
      address: String(a[fm.address] ?? ""),
      city: String(a[fm.city] ?? this.config.county),
      state: this.config.state,
      county: this.config.county,
      centroid,
      zoning_class: String(a[fm.zoning_class] ?? ""),
      zoning_description: a[fm.zoning_description] ?? undefined,
      land_area_acres: (a[fm.land_area_sf] ?? 0) / 43560,
      assessed_value_total: a[fm.assessed_value_total] ?? undefined,
      land_use_code: a[fm.land_use_code] ?? undefined,
      land_use_description: a[fm.land_use_description] ?? undefined,
    };
  }

  private mapDetail(feature: any): AuditorRecord {
    const a = feature.attributes;
    const fm = this.config.fieldMap;
    const landSf = a[fm.land_area_sf] ?? 0;
    const assessed = a[fm.assessed_value_total] ?? 0;
    const millage = a[fm.millage_rate] ?? 0;

    return {
      parcel_number: String(a[fm.parcel_number]),
      owner_name: String(a[fm.owner_name] ?? ""),
      address: String(a[fm.address] ?? ""),
      city: String(a[fm.city] ?? ""),
      zip: String(a[fm.zip] ?? ""),
      zoning_class: String(a[fm.zoning_class] ?? ""),
      zoning_description: a[fm.zoning_description] ?? "",
      land_use_code: String(a[fm.land_use_code] ?? ""),
      land_use_description: a[fm.land_use_description] ?? "",
      land_area_sf: landSf,
      land_area_acres: landSf / 43560,
      assessed_value_land: a[fm.assessed_value_land] ?? 0,
      assessed_value_building: a[fm.assessed_value_building] ?? 0,
      assessed_value_total: assessed,
      market_value_total: a[fm.market_value_total] ?? assessed,
      tax_district: a[fm.tax_district] ?? "",
      millage_rate: millage,
      annual_tax_estimate: millage > 0 ? (assessed * millage) / 1000 : 0,
      last_sale_date: a[fm.last_sale_date] ?? null,
      last_sale_price: a[fm.last_sale_price] ?? null,
      year_built: a[fm.year_built] ?? null,
      building_sf: a[fm.building_sf] ?? null,
    };
  }

  private polygonCentroid(rings: number[][][]): { lat: number; lng: number } {
    const ring = rings[0];
    if (!ring || ring.length === 0) return { lat: 0, lng: 0 };
    let sumX = 0;
    let sumY = 0;
    for (const [x, y] of ring) {
      sumX += x;
      sumY += y;
    }
    return { lng: sumX / ring.length, lat: sumY / ring.length };
  }
}
