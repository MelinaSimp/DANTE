#!/usr/bin/env node
// Copies the pdf.worker file from react-pdf's bundled pdfjs-dist
// into /public, then prepends a tiny `Promise.try` polyfill so the
// worker runs in older Chromium runtimes (notably Electron 31, which
// ships Chromium 126 — `Promise.try` first appeared in Chromium 128).
//
// react-pdf nests its own pdfjs-dist; we prefer the nested path so
// the worker version always matches the main-thread runtime.
// Falls back to the root pdfjs-dist if the nested copy is missing
// (which would be the case if npm hoists in some future install).

const fs = require("fs");
const path = require("path");

const candidates = [
  "node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  // Don't break the install — the postinstall is best-effort. The
  // SourceViewer just won't render PDFs until next npm install.
  console.warn("[pdf-worker] pdfjs-dist not found; skipping setup");
  process.exit(0);
}

const dest = path.join("public", "pdf.worker.min.mjs");
const polyfill =
  'if(typeof Promise.try!=="function"){Promise.try=function(fn){var args=Array.prototype.slice.call(arguments,1);return new Promise(function(resolve){resolve(fn.apply(null,args))})}}\n';

const body = fs.readFileSync(src);
fs.writeFileSync(dest, polyfill + body);
console.log(`[pdf-worker] wrote ${dest} from ${src} (with Promise.try polyfill)`);
