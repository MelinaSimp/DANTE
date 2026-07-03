/*
 * Dante embeddable chat widget loader.
 *
 * Drop this on any website:
 *
 *   <script src="https://YOUR-DOMAIN/widget.js"
 *           data-agent-id="PUBLIC_ID"
 *           data-position="bottom-right"
 *           data-primary-color="#4F46E5"></script>
 *
 * data-agent-id is the agent's widget_public_id (from the builder's
 * "Publish → Web widget" panel), NOT the internal UUID. This script
 * injects a floating launcher bubble + an iframe pointing at
 * /widget/<id>; all chat happens inside that sandboxed iframe against
 * the public /api/widget endpoints. No credentials, no data leaves
 * the iframe origin.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    // Fallback: last <script> that references widget.js
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("widget.js") !== -1) {
        script = all[i];
        break;
      }
    }
  }
  if (!script) return;

  var agentId = script.getAttribute("data-agent-id");
  if (!agentId) {
    console.error("[dante-widget] missing data-agent-id");
    return;
  }
  var color = script.getAttribute("data-primary-color") || "#4F46E5";
  var position = script.getAttribute("data-position") === "bottom-left" ? "bottom-left" : "bottom-right";

  // Origin = wherever this script was served from.
  var origin = script.src.replace(/\/widget\.js.*$/, "");
  var side = position === "bottom-left" ? "left" : "right";

  if (document.getElementById("dante-widget-root")) return; // idempotent

  var root = document.createElement("div");
  root.id = "dante-widget-root";
  root.style.cssText =
    "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483647;";

  // Chat panel (iframe), hidden until opened.
  var panel = document.createElement("div");
  panel.style.cssText =
    "display:none;overflow:hidden;width:380px;max-width:calc(100vw - 40px);" +
    "height:600px;max-height:calc(100vh - 120px);margin-bottom:12px;" +
    "border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,0.18);" +
    "background:#fff;border:1px solid rgba(0,0,0,0.08);";

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/widget/" + encodeURIComponent(agentId) + "?embed=1";
  iframe.title = "Chat";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
  iframe.setAttribute("loading", "lazy");
  panel.appendChild(iframe);

  // Launcher bubble.
  var button = document.createElement("button");
  button.setAttribute("aria-label", "Open chat");
  button.style.cssText =
    "width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;" +
    "background:" + color + ";box-shadow:0 6px 20px rgba(0,0,0,0.22);" +
    "display:flex;align-items:center;justify-content:center;transition:transform .15s;" +
    (side === "left" ? "margin-right:auto;" : "margin-left:auto;");
  button.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"' +
    ' stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var open = false;
  function setOpen(next) {
    open = next;
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    button.innerHTML = open
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  button.addEventListener("click", function () {
    setOpen(!open);
  });

  root.appendChild(panel);
  root.appendChild(button);

  function mount() {
    document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
