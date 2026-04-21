// Minimal RFC-4180-ish CSV parser.
//
// Why inline instead of adding papaparse: the contact importer is the
// only surface that needs it today, the files are small (a few thousand
// rows at most), and advisors/agents export from well-formed sources
// (Google Contacts, Wealthbox, Redtail, Follow Up Boss, kvCORE). An
// extra dep for a 50-line problem isn't worth the supply chain.
//
// Handles: quoted fields with commas, escaped quotes (`""` → `"`),
// trailing/leading whitespace inside unquoted fields, CRLF or LF line
// endings, and the UTF-8 BOM that Excel loves to prepend.
//
// Does not handle: quoted multi-line fields (rare in contact exports).
// If that becomes a real complaint we upgrade to papaparse.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(raw: string): ParsedCsv {
  // Strip BOM — Excel-exported CSVs start with \uFEFF roughly always.
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
      } else {
        if (ch === ",") {
          fields.push(current);
          current = "";
          i += 1;
          continue;
        }
        if (ch === '"' && current.length === 0) {
          inQuotes = true;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
      }
    }
    fields.push(current);
    return fields.map((f) => f.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// Heuristic mapping from common export-header names to our contact
// schema. Each entry is a list of aliases; the first header in the CSV
// that matches any alias wins. Keep the aliases lowercase.
//
// If something common is missing, add it here rather than asking every
// new user to configure column mapping by hand — most exports fall
// into one of these shapes.
export const CONTACT_FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "name",
    "full name",
    "contact name",
    "client name",
    "display name",
  ],
  first_name: ["first name", "firstname", "given name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile phone",
    "cell",
    "cell phone",
    "primary phone",
    "work phone",
    "home phone",
    "phone 1 - value",
  ],
  email: [
    "email",
    "email address",
    "primary email",
    "work email",
    "e-mail 1 - value",
  ],
  notes: ["notes", "note", "description", "about"],
};

export function detectMapping(
  headers: string[],
): Record<string, number | null> {
  const mapping: Record<string, number | null> = {
    name: null,
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
    notes: null,
  };
  for (const field of Object.keys(mapping)) {
    const aliases = CONTACT_FIELD_ALIASES[field];
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}
