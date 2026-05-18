// lib/site-scan/enrichment/epa.ts
// EPA Facility Registry Service — brownfield/contamination check.

export interface BrownfieldResult {
  found: boolean;
  sites: Array<{
    name: string;
    epa_id: string;
    distance_miles: number;
    status: string;
    program: string;
  }>;
  source_url: string;
}

export async function checkBrownfield(
  lat: number,
  lng: number,
  radiusMiles: number = 0.5,
): Promise<BrownfieldResult> {
  const frsUrl =
    `https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities` +
    `?latitude83=${lat}&longitude83=${lng}` +
    `&search_radius=${radiusMiles}` +
    `&pgm_sys_acrnm=CERCLIS,RCRAINFO,BROWNFIELDS` +
    `&output=JSON`;

  try {
    const res = await fetch(frsUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        found: false,
        sites: [],
        source_url: `https://enviro.epa.gov/facts/rcra/search?latitude=${lat}&longitude=${lng}`,
      };
    }
    const json = await res.json();
    const facilities = json.Results?.FRSFacility ?? [];

    return {
      found: facilities.length > 0,
      sites: facilities.slice(0, 10).map((f: any) => ({
        name: f.FacilityName ?? "Unknown",
        epa_id: f.RegistryId ?? "",
        distance_miles: parseFloat(f.DistanceToPoint) || 0,
        status:
          f.SupplementalEnvironmentalInterest?.[0]?.SiteStatus ?? "Unknown",
        program: f.ProgramList ?? "Unknown",
      })),
      source_url: `https://enviro.epa.gov/facts/rcra/search?latitude=${lat}&longitude=${lng}`,
    };
  } catch (err) {
    console.warn("[epa] brownfield check failed:", err);
    return {
      found: false,
      sites: [],
      source_url: `https://enviro.epa.gov/facts/rcra/search?latitude=${lat}&longitude=${lng}`,
    };
  }
}
