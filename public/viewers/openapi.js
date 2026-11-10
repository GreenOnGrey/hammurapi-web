// FTR.HMR.SPEC-0004 R7: the parent posts { type: "openapi", text, theme, vars }; the text is JSON or YAML.
(function () {
  "use strict";
  var shown = null;
  var blob = null;
  function applyTheme(theme, vars) {
    var root = document.documentElement;
    root.dataset.theme = theme === "dark" ? "dark" : "light";
    root.style.colorScheme = root.dataset.theme;
    Object.keys(vars || {}).forEach(function (k) {
      if (/^--[a-z0-9-]+$/.test(k) && typeof vars[k] === "string") root.style.setProperty(k, vars[k]);
    });
  }
  function show(text) {
    if (text === shown) return; // a new theme only: the open operations stay open
    shown = text;
    var spec = null;
    try {
      spec = JSON.parse(text);
    } catch (e) {
      spec = null; // YAML
    }
    var opts = { dom_id: "#ui", deepLinking: false, supportedSubmitMethods: [], tryItOutEnabled: false, validatorUrl: null, defaultModelsExpandDepth: 1 };
    if (blob) URL.revokeObjectURL(blob);
    blob = null;
    if (spec) {
      opts.spec = spec;
    } else {
      // YAML: Swagger UI reads it from a blob URL of this frame; nothing leaves the frame
      blob = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
      opts.url = blob;
    }
    window.SwaggerUIBundle(opts);
  }
  // the links of a contract never navigate the frame: it would leave the page the parent talks to
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a && a.getAttribute("href").charAt(0) !== "#") e.preventDefault();
  }, true);
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== "openapi") return;
    applyTheme(e.data.theme, e.data.vars);
    if (typeof e.data.text === "string") show(e.data.text);
  });
  window.parent.postMessage({ type: "openapi-loaded" }, "*");
})();
