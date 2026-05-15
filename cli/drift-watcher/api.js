#!/usr/bin/env node
// HTTP client for the Drift watcher API.
// Posts file events to /api/watcher/notify with Bearer token auth.

const https = require("https");
const http = require("http");
const { URL } = require("url");

function createClient({ apiUrl, token }) {
  const base = apiUrl.replace(/\/$/, "");

  async function notify(payload) {
    const url = `${base}/api/watcher/notify`;
    const body = JSON.stringify(payload);
    const res = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    return res;
  }

  async function indexBatch(files) {
    const url = `${base}/api/watcher/index-batch`;
    const body = JSON.stringify({ files });
    return request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  }

  async function getContentRequests() {
    const url = `${base}/api/watcher/content-requests`;
    return request(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function fulfillContentRequest(requestId, extractedText) {
    const url = `${base}/api/watcher/content-requests/${requestId}/fulfill`;
    const body = JSON.stringify({ extracted_text: extractedText });
    return request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  }

  return { notify, indexBatch, getContentRequests, fulfillContentRequest };
}

function request(url, opts) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: opts.method || "GET",
        headers: opts.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
            });
          } catch {
            resolve({
              status: res.statusCode,
              data: { raw: data },
            });
          }
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

module.exports = { createClient };
