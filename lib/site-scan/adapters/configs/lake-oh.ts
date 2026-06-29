// lib/site-scan/adapters/configs/lake-oh.ts
// Lake County, Ohio (Willoughby, Mentor, Painesville, Eastlake…) —
// county GIS "Parcels" layer (updated nightly). Verified 2026-06 with a
// live spatial+geometry query (~0.5s): full owner / value / acreage /
// land-use / sale data.

import type { CountyAdapterConfig } from "../types";

export const LAKE_OH: CountyAdapterConfig = {
  county: "Lake",
  state: "OH",
  serviceUrl:
    "https://gis.lakecountyohio.gov/arcgis/rest/services/Sharing/LCGIS_SHARE_2023/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PIN",
    address: "G_FULLADDRESS",
    city: "A_USPS_CITY",
    zip: "A_ZIPCODE",
    zoning_class: "A_PROP_CLASS", // Ohio property/land-use class (numeric)
    land_area_sf: "A_ACRES",
    assessed_value_total: "A_VAL_TOTAL",
    assessed_value_land: "A_VAL_LAND",
    assessed_value_building: "A_VAL_BLDG",
    market_value_total: "A_VAL_TOTAL",
    owner_name: "A_OWNER_NAME",
    land_use_code: "A_PROP_CLASS",
    tax_district: "A_TAX_DIST",
    last_sale_date: "A_SALE_DATE",
    last_sale_price: "A_SALE_AMOUNT",
    year_built: "A_YEAR_BUILT",
  },
  areaFieldIsAcres: true, // A_ACRES is auditor acreage
  // Ohio property-class codes: 3xx industrial, 4xx commercial, 5xx residential.
  zoningClassMap: {
    retail: ["400", "401", "402", "410", "411", "412", "419", "420", "421", "422", "423", "424", "425", "426", "427", "428", "429", "430", "431", "432", "433", "434", "435", "436", "437", "438", "439", "440", "441", "442", "443", "444", "445", "446", "447", "448", "449"],
    industrial: ["300", "310", "320", "330", "340", "350", "360", "370", "380", "385", "390", "395", "399"],
    residential: ["500", "510", "511", "520", "530", "540", "550", "560", "570", "599"],
    office: ["450", "460", "470"],
    vacant: ["100", "300", "400", "500"],
  },
};
