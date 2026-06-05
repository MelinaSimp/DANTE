// lib/site-scan/adapters/configs/oregon.ts
// Oregon statewide parcel data via Oregon Spatial Data Library.
// Framework taxlot layer covering all 36 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_OR: CountyAdapterConfig = {
  county: "*",
  state: "OR",
  serviceUrl:
    "https://gis.oregon.gov/arcgis/rest/services/Framework/Cadastral_Taxlots/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "MAPTAXLOT",
    address: "SITEADDR",
    city: "SITECITY",
    zip: "SITEZIP",
    zoning_class: "LANDUSE",
    zoning_description: "LANDUSE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTALVAL",
    assessed_value_land: "LANDVAL",
    assessed_value_building: "IMPVAL",
    market_value_total: "RMV",
    owner_name: "OWNER",
    land_use_code: "LANDUSE",
    land_use_description: "LANDUSE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "GC", "CC"],
    industrial: ["I", "EI", "GI", "HI", "LI", "IP"],
    residential: ["R", "R-1", "R-2", "R-3", "R-5", "RL", "RM", "RH"],
    office: ["CO", "OP", "OC"],
    mixed_use: ["MU", "CM", "MR", "EX"],
    vacant: ["EFU", "AF", "OS", "TBR", "FG"],
  },
};
