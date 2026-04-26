(async function iniciarContenido() {
  const HOST_OK = location.hostname.includes("controldocumentario.com");
  const EN_BANDEJA = location.pathname.toLowerCase().includes("/bandeja.aspx");
  if (!HOST_OK || !EN_BANDEJA) return;
  if (document.getElementById("docauto-panel")) return;

  await inyectarCss();
  await inyectarPanelHtml();
  iniciarBridgeMensajes();
  await cargarScripts(["storage.js", "imagedb.js", "matcher.js", "pdf-splitter.js", "ocr-engine.js", "modal-seleccion.js", "panel.js"]);

  function inyectarCss() {
    return new Promise((resolve) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = chrome.runtime.getURL("panel.css");
      css.onload = () => resolve();
      document.head.appendChild(css);
    });
  }

  async function inyectarPanelHtml() {
    const url = chrome.runtime.getURL("panel.html");
    const html = await fetch(url).then((r) => r.text());
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
  }

  async function cargarScripts(archivos) {
    for (const archivo of archivos) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = chrome.runtime.getURL(archivo);
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`No se pudo cargar ${archivo}`));
        (document.head || document.documentElement).appendChild(s);
      });
    }
  }

  function iniciarBridgeMensajes() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__mauTipo !== "MAU_TO_EXTENSION") return;

      chrome.runtime.sendMessage(data.payload, (response) => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage(
          {
            __mauTipo: "MAU_FROM_EXTENSION",
            requestId: data.requestId,
            response,
            error: runtimeError ? runtimeError.message : null
          },
          "*"
        );
      });
    });
  }
})();
