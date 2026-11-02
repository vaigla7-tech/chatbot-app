/*!
 * Lendermarket AI Assistant - embeddable website widget.
 *
 * Usage (place before </body> on an allowlisted site):
 *   <script src="https://YOUR-APP.up.railway.app/embed.js" data-lang="en" defer></script>
 *
 * Optional attributes: data-lang (en|et|es|it|fr|de|pl), data-position (right|left),
 * data-color (#RRGGBB launcher colour), data-label (accessible launcher label).
 *
 * The chat runs in an isolated iframe served from the assistant's own origin.
 * It cannot read the host page's cookies, storage or DOM, and the host cannot
 * read the conversation. Only a few validated UI messages cross the boundary.
 */
(function () {
  "use strict";
  if (window.__lmChatLoaded) return;
  window.__lmChatLoaded = true;

  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;
  var lang = (script.getAttribute("data-lang") || "").toLowerCase();
  if (!/^(en|et|es|it|fr|de|pl)$/.test(lang)) lang = "";
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-color") || "#8550F6";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = "#8550F6";
  var label = script.getAttribute("data-label") || "Open Lendermarket AI Assistant";

  var Z = 2147483000;
  var root = document.createElement("div");
  root.setAttribute("data-lm-chat", "");
  var shadow = root.attachShadow ? root.attachShadow({ mode: "closed" }) : root;

  var style = document.createElement("style");
  style.textContent =
    ".launcher{position:fixed;bottom:20px;" + position + ":20px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;" +
    "background:" + color + ";box-shadow:0 8px 24px rgba(36,21,89,.28);display:flex;align-items:center;justify-content:center;z-index:" + Z + ";transition:transform .15s}" +
    ".launcher:hover{transform:scale(1.05)}.launcher:focus-visible{outline:3px solid #241559;outline-offset:3px}" +
    ".launcher svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".panel{position:fixed;bottom:92px;" + position + ":20px;width:400px;height:640px;max-height:calc(100vh - 112px);border-radius:20px;overflow:hidden;" +
    "box-shadow:0 16px 48px rgba(36,21,89,.25);border:1px solid #D8D2EC;background:#fff;z-index:" + (Z + 1) + ";display:none}" +
    ".panel.open{display:block}.panel.full{bottom:0;" + position + ":0;width:100vw;height:100vh;max-height:100vh;border-radius:0}" +
    ".panel iframe{width:100%;height:100%;border:0;display:block}" +
    "@media (max-width:640px){.panel{bottom:0;left:0;right:0;width:100vw;height:100%;max-height:100%;border-radius:0}.launcher.hidden{display:none}}";
  shadow.appendChild(style);

  var button = document.createElement("button");
  button.className = "launcher";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Lendermarket AI Assistant");

  var iframe = null;
  function ensureFrame() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.src = origin + "/widget" + (lang ? "?lang=" + lang : "");
    iframe.title = "Lendermarket AI Assistant";
    iframe.setAttribute("referrerpolicy", "strict-origin");
    // Same-origin is the assistant's own origin; the host page gains no access.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
    iframe.setAttribute("allow", "clipboard-write");
    panel.appendChild(iframe);
  }

  function open() {
    ensureFrame();
    panel.classList.add("open");
    button.classList.add("hidden");
    button.setAttribute("aria-expanded", "true");
  }
  function close() {
    panel.classList.remove("open", "full");
    button.classList.remove("hidden");
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  button.addEventListener("click", function () {
    panel.classList.contains("open") ? close() : open();
  });

  // Strictly validated message interface: only our iframe's origin, only known types.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !iframe || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.source !== "lm-chat") return;
    if (data.type === "close") close();
    else if (data.type === "toggle-fullscreen") panel.classList.toggle("full");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });

  shadow.appendChild(panel);
  shadow.appendChild(button);
  (document.body || document.documentElement).appendChild(root);

  window.LendermarketChat = { open: open, close: close };
})();
