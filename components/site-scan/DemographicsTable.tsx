interface DemographicsTableProps {
  profile: {
    total_population?: number;
    median_household_income?: number;
    median_age?: number;
    average_household_size?: number;
    owner_occupied_pct?: number;
    labor_force_participation_rate?: number;
    unemployment_rate?: number;
    bachelor_degree_plus_pct?: number;
    median_home_value?: number;
    census_tract?: string;
  };
}

function fmt(val: number | undefined, prefix = "", suffix = "") {
  if (val == null) return "--";
  return `${prefix}${val.toLocaleString()}${suffix}`;
}

export default function DemographicsTable({
  profile,
}: DemographicsTableProps) {
  const rows = [
    {
      label: "Population",
      value: fmt(profile.total_population),
    },
    {
      label: "Median Household Income",
      value: fmt(profile.median_household_income, "$"),
    },
    {
      label: "Median Age",
      value: fmt(profile.median_age),
    },
    {
      label: "Avg. Household Size",
      value: profile.average_household_size?.toFixed(1) ?? "--",
    },
    {
      label: "Owner-Occupied",
      value: fmt(profile.owner_occupied_pct, "", "%"),
    },
    {
      label: "Labor Force Participation",
      value: fmt(profile.labor_force_participation_rate, "", "%"),
    },
    {
      label: "Unemployment",
      value: fmt(profile.unemployment_rate, "", "%"),
    },
    {
      label: "Bachelor's Degree+",
      value: fmt(profile.bachelor_degree_plus_pct, "", "%"),
    },
    {
      label: "Median Home Value",
      value: fmt(profile.median_home_value, "$"),
    },
  ].filter((r) => r.value !== "--");

  return (
    <div className="space-y-1">
      {profile.census_tract && (
        <p className="text-xs text-[var(--ink-muted)] mb-2">
          Census Tract: {profile.census_tract}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between">
            <span className="text-[var(--ink-subtle)] text-xs">{row.label}</span>
            <span className="font-mono font-medium text-[var(--ink)] text-xs">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
