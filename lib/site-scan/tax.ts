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

export function estimateTax(
  auditorData: any,
  craData?: any,
): TaxEstimate {
  const assessed = auditorData.assessed_value_total ?? 0;
  const millage = auditorData.millage_rate ?? 0;
  const annualTax = millage > 0 ? (assessed * millage) / 1000 : 0;

  const result: TaxEstimate = {
    assessed_value: assessed,
    millage_rate: millage,
    estimated_annual_tax: Math.round(annualTax),
    tax_year: auditorData.tax_year ?? new Date().getFullYear(),
    cra_eligible: false,
    assessment_ratio: 0.35,
    note:
      "Ohio assessed values are 35% of appraised market value. " +
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
