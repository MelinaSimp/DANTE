// lib/site-scan/adapters/configs/vermont.ts
// Vermont statewide parcel data via Vermont Center for Geographic
// Information (VCGI). All 251 towns. Very rich attribute set with
// owner, values, address, and property type.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_VT: CountyAdapterConfig = {
  county: "*",
  state: "VT",
  serviceUrl:
    "https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_VTPARCELS_WM_NOCACHE_v2/FeatureServer",
  layerId: 1,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "SPAN",
    address: "E911ADDR",
    city: "TNAME",
    zip: "",
    zoning_class: "CAT",
    zoning_description: "PROPTYPE",
    land_area_sf: "ACRESGL",
    assessed_value_total: "REAL_FLV",
    assessed_value_land: "LAND_LV",
    assessed_value_building: "IMPRV_LV",
    market_value_total: "REAL_FLV",
    owner_name: "OWNER1",
    land_use_code: "CAT",
    land_use_description: "DESCPROP",
    tax_district: "TNAME",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["COM"],
    industrial: ["IND"],
    residential: ["RES", "R1", "R2", "MH"],
    office: ["COM"],
    mixed_use: ["MXD", "MU"],
    vacant: ["WDL", "FARM", "AG", "VAC"],
  },
};
