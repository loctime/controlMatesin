/**
 * Clasificación de páginas usando Claude API (visión).
 * Renderiza cada página del PDF con pdf.js y la envía al background
 * (que llama a la API de Anthropic) para obtener el tipo de documento.
 */
(function () {
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function cargarScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-mau-src="${url}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = url;
      s.dataset.mauSrc = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
      document.head.appendChild(s);
    });
  }

  async function asegurarPdfJs() {
    if (!window.pdfjsLib) await cargarScript(PDFJS_URL);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }

  function enviarMensajeExtension(payload) {
    return new Promise((resolve, reject) => {
      const requestId = `mau-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.__mauTipo !== "MAU_FROM_EXTENSION" || data.requestId !== requestId) return;
        window.removeEventListener("message", onMessage);
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        if (!data.response?.ok) {
          reject(new Error(data.response?.error || "Error en background."));
          return;
        }
        resolve(data.response.data);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ __mauTipo: "MAU_TO_EXTENSION", requestId, payload }, "*");
    });
  }

  function canvasABase64Jpeg(canvas, calidad = 0.75) {
    const dataUrl = canvas.toDataURL("image/jpeg", calidad);
    // dataUrl = "data:image/jpeg;base64,XXXXXX"
    return dataUrl.split(",")[1] || "";
  }

  /**
   * @param {File} file
   * @param {(info: { fase: string, pagina?: number, totalPaginas?: number, mensaje?: string }) => void} [onProgress]
   * @param {{maxPaginas?: number}} [opciones] - maxPaginas limita cuántas páginas se leen con IA (ahorro de API).
   * @returns {Promise<Array<{ pagina: number, texto: string, id: string }>>}
   */
  async function extraerTextoPorPagina(file, onProgress, opciones) {
    await asegurarPdfJs();

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const numPages = pdf.numPages;
    const maxPaginas = Math.max(1, Math.min(opciones?.maxPaginas || numPages, numPages));
    const scale = 200 / 72; // 200 DPI para mejor lectura de escaneos rotados

    const reportar = (info) => {
      if (typeof onProgress === "function") onProgress(info);
    };

    reportar({ fase: "inicio", totalPaginas: maxPaginas, mensaje: "Iniciando análisis con Claude…" });

    const salida = [];
    for (let i = 1; i <= maxPaginas; i++) {
      reportar({
        fase: "render",
        pagina: i,
        totalPaginas: numPages,
        mensaje: `Preparando página ${i} de ${numPages}…`
      });

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const w = Math.floor(viewport.width);
      const h = Math.floor(viewport.height);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      // Fondo blanco para que JPEG quede más chico y legible
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const base64 = canvasABase64Jpeg(canvas, 0.75);

      reportar({
        fase: "ia",
        pagina: i,
        totalPaginas: numPages,
        mensaje: `Clasificando página ${i} de ${numPages} con Claude…`
      });

      try {
        const resultado = await enviarMensajeExtension({
          action: "ai:clasificarPagina",
          payload: { base64, mediaType: "image/jpeg" }
        });
        salida.push({
          pagina: i,
          texto: resultado?.etiqueta || "",
          id: resultado?.id || "desconocido",
          etiqueta: resultado?.etiqueta || "",
          cuil: resultado?.cuil || "",
          apellido: resultado?.apellido || "",
          nombre: resultado?.nombre || "",
          patente: resultado?.patente || "",
          periodo: resultado?.periodo || ""
        });
      } catch (e) {
        console.warn(`[MAU] Error clasificando página ${i}:`, e);
        salida.push({
          pagina: i,
          texto: "",
          id: "desconocido",
          etiqueta: "",
          cuil: "",
          apellido: "",
          nombre: "",
          patente: "",
          periodo: ""
        });
      }

      reportar({
        fase: "pagina-lista",
        pagina: i,
        totalPaginas: numPages,
        mensaje: `Listo página ${i} de ${numPages}`
      });
    }

    try { pdf.destroy(); } catch { /* noop */ }
    return salida;
  }

  async function contarPaginasPdf(file) {
    await asegurarPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const n = pdf.numPages;
    try { pdf.destroy(); } catch { /* noop */ }
    return n;
  }

  window.MAUOcrEngine = {
    extraerTextoPorPagina,
    contarPaginasPdf,
    asegurarPdfJs
  };
})();
