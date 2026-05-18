import ParcelSection from "./ParcelSection";
import DemographicsTable from "./DemographicsTable";
import TaxEstimateCard from "./TaxEstimateCard";

interface ParcelDetailProps {
  data: {
    parcel_number: string;
    county: string;
    state: string;
    sections: {
      auditor?: any;
      tax_estimate?: any;
      demographics?: any;
      environmental?: any;
      linked_documents?: any[];
    };
    caveat: string;
  };
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-[var(--ink-muted)] text-xs">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

export default function ParcelDetail({ data }: ParcelDetailProps) {
  const { sections } = data;
  const auditor = sections.auditor;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">
          {auditor?.address ?? `Parcel ${data.parcel_number}`}
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          {data.county} County, {data.state} -- Parcel{" "}
          {data.parcel_number}
        </p>
      </div>

      {/* Auditor / Overview */}
      {auditor && (
        <ParcelSection
          title="Property Record"
          source={auditor._source}
          accessedAt={auditor._accessed}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner" value={auditor.owner_name} />
            <Field
              label="Zoning"
              value={`${auditor.zoning_class} -- ${auditor.zoning_description}`}
            />
            <Field
              label="Land Area"
              value={`${auditor.land_area_acres?.toFixed(2)} acres (${auditor.land_area_sf?.toLocaleString()} SF)`}
            />
            <Field
              label="Building SF"
              value={auditor.building_sf?.toLocaleString() ?? "--"}
            />
            <Field
              label="Year Built"
              value={auditor.year_built ?? "--"}
            />
            <Field
              label="Land Use"
              value={auditor.land_use_description ?? "--"}
            />
            <Field
              label="Last Sale"
              value={
                auditor.last_sale_date
                  ? `$${auditor.last_sale_price?.toLocaleString()} (${auditor.last_sale_date})`
                  : "--"
              }
            />
            <Field
              label="Assessed Value"
              value={`$${auditor.assessed_value_total?.toLocaleString()}`}
            />
          </div>
        </ParcelSection>
      )}

      {/* Tax Estimate */}
      {sections.tax_estimate && (
        <ParcelSection
          title="Tax Estimate"
          source="Derived from county auditor data"
          accessedAt={auditor?._accessed ?? new Date().toISOString()}
        >
          <TaxEstimateCard estimate={sections.tax_estimate} />
        </ParcelSection>
      )}

      {/* Demographics */}
      {sections.demographics && (
        <ParcelSection
          title="Trade Area Demographics"
          source={sections.demographics._source}
          accessedAt={sections.demographics._accessed}
        >
          <DemographicsTable profile={sections.demographics} />
        </ParcelSection>
      )}

      {/* Environmental */}
      {sections.environmental && (
        <ParcelSection
          title="Environmental"
          source={sections.environmental._source}
          accessedAt={sections.environmental._accessed}
        >
          {sections.environmental.brownfield_sites_nearby ? (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <p className="font-medium text-amber-800">
                Brownfield sites found within 0.5 miles
              </p>
              <ul className="mt-2 space-y-1">
                {sections.environmental.sites.map(
                  (s: any, i: number) => (
                    <li key={i} className="text-amber-700">
                      {s.name} ({s.program}) --{" "}
                      {s.distance_miles.toFixed(2)} mi -- {s.status}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">
              No brownfield sites found within 0.5 miles.
            </p>
          )}
        </ParcelSection>
      )}

      {/* Linked Documents */}
      <ParcelSection
        title="Your Documents"
        source="Vault"
        accessedAt={new Date().toISOString()}
        confidence="user_upload"
      >
        {(sections.linked_documents?.length ?? 0) > 0 ? (
          <ul className="space-y-2">
            {sections.linked_documents!.map((doc: any) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 text-sm"
              >
                <span className="font-medium">
                  {doc.title ?? doc.id}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">
            No documents linked to this parcel yet. Upload a zoning
            letter, Phase I, or lease abstract to the vault and link
            it here.
          </p>
        )}
      </ParcelSection>

      {/* Caveat */}
      <p className="text-xs text-[var(--ink-muted)] border-t border-[var(--edge)] pt-4">
        {data.caveat}
      </p>
    </div>
  );
}
