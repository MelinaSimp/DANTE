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
          <p className="text-[var(--ink-muted)] text-xs">Assessed Value</p>
          <p className="font-mono font-medium">
            ${estimate.assessed_value.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-muted)] text-xs">Millage Rate</p>
          <p className="font-mono font-medium">
            {estimate.millage_rate}
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-muted)] text-xs">
            Est. Annual Tax ({estimate.tax_year})
          </p>
          <p className="font-mono font-medium">
            ${estimate.estimated_annual_tax.toLocaleString()}
          </p>
        </div>
      </div>

      {estimate.cra_eligible && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm">
          <p className="font-medium text-emerald-800">
            CRA Tax Abatement Eligible
          </p>
          <div className="mt-2 grid grid-cols-3 gap-4 text-emerald-700">
            <div>
              <p className="text-xs">Abatement</p>
              <p className="font-mono font-medium">
                {estimate.abatement_percentage}%
              </p>
            </div>
            <div>
              <p className="text-xs">Years Remaining</p>
              <p className="font-mono font-medium">
                {estimate.abatement_years_remaining}
              </p>
            </div>
            <div>
              <p className="text-xs">Annual Savings</p>
              <p className="font-mono font-medium">
                ${estimate.estimated_abatement_savings?.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--ink-muted)] italic">
        {estimate.note}
      </p>
    </div>
  );
}
