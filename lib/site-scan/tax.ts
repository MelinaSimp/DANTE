// lib/site-scan/tax.ts
// Tax estimation with CRA abatement calculation.

export interface TaxEstimate {
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
}

// State-specific assessment ratio notes. Ohio uses a fixed 35%;
// PA varies by county (common-level ratio set annually by STEB);
// most other states assess at or near 100% of market value.
const STATE_ASSESSMENT_INFO: Record<string, { ratio: number; note: string }> = {
  OH: {
    ratio: 0.35,
    note: "Ohio assessed values are 35% of appraised market value. ",
  },
  PA: {
    ratio: 1.0, // PA ratios vary by county; CLR applied by county, not us
    note: "PA assessed values use a county-specific common-level ratio (CLR) set annually by the State Tax Equalization Board. ",
  },
};

const DEFAULT_ASSESSMENT_INFO = {
  ratio: 1.0,
  note: "",
};

export function estimateTax(
  auditorData: any,
  craData?: any,
  state?: string,
): TaxEstimate {
  const assessed = auditorData.assessed_value_total ?? 0;
  const millage = auditorData.millage_rate ?? 0;
  const annualTax = millage > 0 ? (assessed * millage) / 1000 : 0;

  const info = (state && STATE_ASSESSMENT_INFO[state]) || DEFAULT_ASSESSMENT_INFO;

  const result: TaxEstimate = {
    assessed_value: assessed,
    millage_rate: millage,
    estimated_annual_tax: Math.round(annualTax),
    tax_year: auditorData.tax_year ?? new Date().getFullYear(),
    cra_eligible: false,
    assessment_ratio: info.ratio,
    note:
      info.note +
      "This is an estimate -- contact the County Treasurer for official amounts.",
  };

  if (craData?.eligible) {
    result.cra_eligible = true;
    result.abatement_percentage = craData.percentage ?? 0;
    result.abatement_years_remaining = craData.years_remaining ?? 0;
    result.estimated_abated_annual_tax = Math.round(
      annualTax * (1 - (craData.percentage ?? 0) / 100),
    );
    result.estimated_abatement_savings = Math.round(
      (annualTax * (craData.percentage ?? 0)) / 100,
    );
  }

  return result;
}
