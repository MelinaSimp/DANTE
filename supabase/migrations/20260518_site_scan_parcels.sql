-- Site Scan: Parcel Intelligence for CRE

-- 1. Enable PostGIS (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Core parcel entity
CREATE TABLE IF NOT EXISTS parcels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parcel_number   text NOT NULL,
  county          text NOT NULL,
  state           char(2) NOT NULL,
  address         text,
  city            text,
  zip             text,
  centroid        geography(POINT, 4326),
  boundary        geography(POLYGON, 4326),
  acreage         numeric GENERATED ALWAYS AS (
    CASE WHEN boundary IS NOT NULL
      THEN ROUND((ST_Area(boundary::geography) / 4046.8564224)::numeric, 2)
      ELSE NULL
    END
  ) STORED,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(workspace_id, parcel_number, county, state)
);

CREATE INDEX IF NOT EXISTS idx_parcels_workspace ON parcels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parcels_centroid ON parcels USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_parcels_address ON parcels USING gin(to_tsvector('english', coalesce(address,'')));

-- 3. Cached external data per parcel per source
CREATE TABLE IF NOT EXISTS parcel_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id       uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN (
    'auditor', 'census', 'epa', 'cra', 'dot', 'crexi'
  )),
  data            jsonb NOT NULL,
  source_url      text,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  UNIQUE(parcel_id, source)
);

CREATE INDEX IF NOT EXISTS idx_parcel_cache_expiry ON parcel_cache(expires_at);

-- 4. Link vault documents to parcels
CREATE TABLE IF NOT EXISTS parcel_documents (
  parcel_id       uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL,
  tagged_at       timestamptz DEFAULT now(),
  PRIMARY KEY (parcel_id, document_id)
);

-- 5. Listing cache (area-based, not parcel-specific)
CREATE TABLE IF NOT EXISTS listing_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source          text NOT NULL DEFAULT 'crexi',
  listing_id      text NOT NULL,
  address         text,
  location        geography(POINT, 4326),
  property_type   text,
  square_feet     integer,
  acreage         numeric,
  asking_price    numeric,
  listing_broker  text,
  listing_data    jsonb,
  source_url      text,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  UNIQUE(workspace_id, source, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_location ON listing_cache USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_listing_expiry ON listing_cache(expires_at);

-- 6. Parcel search RPC (spatial + attribute filtering)
CREATE OR REPLACE FUNCTION search_parcels(
  p_workspace_id  uuid,
  p_lat           double precision DEFAULT NULL,
  p_lng           double precision DEFAULT NULL,
  p_radius_meters double precision DEFAULT 8047,
  p_zoning        text[] DEFAULT NULL,
  p_acreage_min   numeric DEFAULT NULL,
  p_acreage_max   numeric DEFAULT NULL,
  p_max_results   integer DEFAULT 25
)
RETURNS TABLE (
  id              uuid,
  parcel_number   text,
  county          text,
  state           char(2),
  address         text,
  centroid        geography,
  acreage         numeric,
  auditor_data    jsonb,
  distance_meters double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.parcel_number,
    p.county,
    p.state,
    p.address,
    p.centroid,
    p.acreage,
    pc.data AS auditor_data,
    CASE WHEN p_lat IS NOT NULL
      THEN ST_Distance(
        p.centroid,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      )
      ELSE NULL
    END AS distance_meters
  FROM parcels p
  LEFT JOIN parcel_cache pc
    ON pc.parcel_id = p.id AND pc.source = 'auditor'
  WHERE p.workspace_id = p_workspace_id
    AND (p_lat IS NULL OR ST_DWithin(
      p.centroid,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    ))
    AND (p_zoning IS NULL OR pc.data->>'zoning_class' = ANY(p_zoning))
    AND (p_acreage_min IS NULL OR p.acreage >= p_acreage_min)
    AND (p_acreage_max IS NULL OR p.acreage <= p_acreage_max)
  ORDER BY distance_meters ASC NULLS LAST
  LIMIT p_max_results;
$$;
