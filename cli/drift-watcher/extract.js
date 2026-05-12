#!/usr/bin/env node
// Text extraction for PDF, DOCX, and plain text files.
// Portable — no Electron or browser APIs required.

const fs = require("fs");
const path = require("path");

const MAX_CHARS = 1_000_000;

const PLAIN_EXTS = new Set([
  "txt", "md", "csv", "json", "xml", "html", "htm", "yaml", "yml", "log",
]);

async function extractText(filePath) {
  const ext = (path.extname(filePath).slice(1) || "").toLowerCase();

  if (ext === "pdf") return extractPdf(filePath);
  if (ext === "docx") return extractDocx(filePath);
  if (PLAIN_EXTS.has(ext)) return extractPlain(filePath);

  return { text: "", supported: false };
}

async function extractPdf(filePath) {
  const pdfParse = require("pdf-parse");
  const buf = fs.readFileSync(filePath);
  const result = await pdfParse(buf, { max: 0 });
  let text = result.text || "";
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { text, supported: true, pages: result.numpages };
}

async function extractDocx(filePath) {
  const JSZip = require("jszip");
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return { text: "", supported: true };
  let text = docXml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { text, supported: true };
}

function extractPlain(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { text, supported: true };
}

module.exports = { extractText };
