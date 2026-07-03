import { describe, it, expect } from "vitest";
import { classifyDocument } from "./classify";

describe("document classifier", () => {
  it("classifies rent rolls from title + column shape", () => {
    const c = classifyDocument({
      title: "Eastgate Center Rent Roll.xlsx",
      fileType: "xlsx",
      text: "Tenant  Suite  SF  Base Rent  Lease Start",
    });
    expect(c.type).toBe("rent_roll");
  });

  it("classifies leases", () => {
    const c = classifyDocument({
      title: "N.Huntington Ground Lease FINAL.pdf",
      fileType: "pdf",
      text: "THIS LEASE AGREEMENT is made... Landlord and Tenant agree... the Commencement Date of the demised premises... base rent",
    });
    expect(c.type).toBe("lease");
  });

  it("classifies Phase I ESA reports as environmental, not operating statements", () => {
    // Regression: this real vault doc was labeled OPERATING STATEMENT
    // because the report body mentions net operating income.
    const c = classifyDocument({
      title: "Phase I Environmental Assessement-Figures, Photos & Appendix.pdf",
      fileType: "pdf",
      text: "Phase I Environmental Site Assessment prepared in accordance with ASTM E-1527-05. No recognized environmental conditions were identified. The property generates net operating income of...",
    });
    expect(c.type).toBe("environmental");
  });

  it("classifies environmental docs from title pattern alone", () => {
    const c = classifyDocument({
      title: "Phase 1 - NH Refi.pdf",
      fileType: "pdf",
      text: "environmental records review, groundwater sampling, underground storage tank closure, remediation summary",
    });
    expect(c.type).toBe("environmental");
  });

  it("classifies appraisals over operating statements when both signal", () => {
    const c = classifyDocument({
      title: "09-11-2009 Appraisal North Huntingdon.pdf",
      fileType: "pdf",
      text: "Appraisal report. As-is market value conclusion via the income approach and sales comparison approach. Net operating income was estimated at...",
    });
    expect(c.type).toBe("appraisal");
  });

  it("still classifies true operating statements", () => {
    const c = classifyDocument({
      title: "T-12 Dec 2025.pdf",
      fileType: "pdf",
      text: "Trailing twelve operating statement. Net operating income. Total operating expenses.",
    });
    expect(c.type).toBe("operating_statement");
  });

  it("returns other for unrecognizable docs", () => {
    const c = classifyDocument({
      title: "Officers Certificate.pdf",
      fileType: "pdf",
      text: "The undersigned officer hereby certifies the attached resolutions are true and correct.",
    });
    expect(c.type).toBe("other");
    expect(c.confidence).toBe(0);
  });
});
