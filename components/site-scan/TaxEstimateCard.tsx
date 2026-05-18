interface TaxEstimateCardProps {
  estimate: {
    assessed_value: number;
    millage_rate: number;
    estimated_annual_tax: number;
    tax_year: number;
    cra_eligible: boolean;
    abatement_percentage?: number;
    abatement_years_remaining?: number;
    estimated_abated_annual_tax?: number;
    estimated_abatement_savings?: number;
    assessment_ratio: number;
    note: string;
  };
}

export default function TaxEstimateCard({
  estimate,
}: TaxEstimateCardProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[var(--ink-subtle)] text-xs mb-0.5">Assessed Value</p>
          <p className="font-mono font-medium text-[var(--ink)]">
            ${estimate.assessed_value.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-subtle)] text-xs mb-0.5">Millage Rate</p>
          <p className="font-mono font-medium text-[var(--ink)]">
            {estimate.millage_rate}
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-subtle)] text-xs mb-0.5">
            Est. Annual Tax ({estimate.tax_year})
          </p>
          <p className="font-mono font-medium text-[var(--ink)]">
            ${estimate.estimated_annual_tax.toLocaleString()}
          </p>
        </div>
      </div>

      {estimate.cra_eligible && (
        <div className="border border-[var(--rule)] rounded-[4px] p-3 text-sm bg-[var(--canvas)]">
          <p className="font-semibold text-[var(--ink)] text-xs">
            CRA Tax Abatement Eligible
          </p>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[var(--ink-subtle)] text-xs mb-0.5">Abatement</p>
              <p className="font-mono font-medium text-[var(--ink)]">
                {estimate.abatement_percentage}%
              </p>
            </div>
            <div>
              <p className="text-[var(--ink-subtle)] text-xs mb-0.5">Years Remaining</p>
              <p className="font-mono font-medium text-[var(--ink)]">
                {estimate.abatement_years_remaining}
              </p>
            </div>
            <div>
              <p className="text-[var(--ink-subtle)] text-xs mb-0.5">Annual Savings</p>
              <p className="font-mono font-medium text-[var(--ink)]">
                ${estimate.estimated_abatement_savings?.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--ink-subtle)]">
        {estimate.note}
      </p>
    </div>
  );
}
