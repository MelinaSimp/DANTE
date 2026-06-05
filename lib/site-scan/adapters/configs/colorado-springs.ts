// lib/site-scan/adapters/configs/colorado-springs.ts
// El Paso County, CO — Colorado Springs MSA.
// County-specific adapter with richer data than statewide.

import type { CountyAdapterConfig } from "../types";

export const ELPASO_CO: CountyAdapterConfig = {
  county: "El Paso",
  state: "CO",
  serviceUrl:
    "https://gis.elpasoco.com/arcgis/rest/services/Public/Assessor_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "SCHEDULENUM",
    address: "SITUS",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "ZONEDESC",
    zoning_description: "ZONEDESC",
    land_area_sf: "ACRES",
    assessed_value_total: "ACTUALVALUE",
    assessed_value_land: "LANDACTUAL",
    assessed_value_building: "IMPACTUAL",
    market_value_total: "ACTUALVALUE",
    owner_name: "OWNERNAME",
    land_use_code: "PROPCLASS",
    land_use_description: "PROPCLASS",
    tax_district: "TAXDIST",
    year_built: "YEARBUILT",
    building_sf: "SQFT",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["CC", "CG", "CS", "CR"],
    industrial: ["I-1", "I-2", "IP", "PBC"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "RE", "RM"],
    office: ["OC", "OR"],
    mixed_use: ["MU", "PUD", "MN"],
    vacant: ["A", "A-5", "A-35", "OS", "RR"],
  },
};
