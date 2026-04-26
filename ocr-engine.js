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

    // paginasEspecificas: array de números de página a procesar (1-based).
    // Si no se pasa, procesa desde 1 hasta maxPaginas.
    const especificas = Array.isArray(opciones?.paginasEspecificas)
      ? opciones.paginasEspecificas.filter((n) => n >= 1 && n <= numPages)
      : null;
    const maxPaginas = especificas
      ? numPages
      : Math.max(1, Math.min(opciones?.maxPaginas || numPages, numPages));
    const totalAProcesar = especificas ? especificas.length : maxPaginas;

    const scale = 200 / 72;

    const reportar = (info) => {
      if (typeof onProgress === "function") onProgress(info);
    };

    reportar({ fase: "inicio", totalPaginas: totalAProcesar, mensaje: "Iniciando análisis con Claude…" });

    const salida = [];
    const paginasAIterar = especificas || Array.from({ length: maxPaginas }, (_, k) => k + 1);
    let idx = 0;
    for (const i of paginasAIterar) {
      idx++;
      reportar({
        fase: "render",
        pagina: idx,
        totalPaginas: totalAProcesar,
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
        pagina: idx,
        totalPaginas: totalAProcesar,
        mensaje: `Clasificando página ${i} con Claude… (${idx}/${totalAProcesar})`
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
          periodo: resultado?.periodo || "",
          textoEstable: resultado?.textoEstable || ""
        });
      } catch (e) {
        // Si es error de API Key o configuración, relanzar de inmediato — no tiene sentido
        // seguir procesando el resto de las páginas sin Claude.
        if (/api.?key|anthropic|cargala/i.test(e?.message || "")) throw e;
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
          periodo: "",
          textoEstable: ""
        });
      }

      reportar({
        fase: "pagina-lista",
        pagina: idx,
        totalPaginas: totalAProcesar,
        mensaje: `Listo página ${i} (${idx}/${totalAProcesar})`
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

  /**
   * Convierte todas las páginas de un PDF a imágenes base64 SIN llamar a Claude.
   * Usado para capturar imágenes de referencia al aprender, y las páginas nuevas al trabajar.
   *
   * @param {File} file
   * @param {(info: {pagina:number, totalPaginas:number}) => void} [onProgress]
   * @param {{ escala?: number, calidad?: number }} [opciones]
   *   - escala: resolución (default 120 → buen balance tamaño/nitidez para comparación)
   *   - calidad: calidad JPEG 0-1 (default 0.55)
   * @returns {Promise<Array<{pagina:number, base64:string}>>}
   */
  async function renderizarPaginas(file, onProgress, opciones) {
    await asegurarPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const numPages = pdf.numPages;
    const escala = ((opciones?.escala) || 120) / 72;
    const calidad = (opciones?.calidad) ?? 0.55;
    const salida = [];

    for (let i = 1; i <= numPages; i++) {
      if (typeof onProgress === "function") onProgress({ pagina: i, totalPaginas: numPages });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      salida.push({ pagina: i, base64: canvasABase64Jpeg(canvas, calidad) });
    }

    try { pdf.destroy(); } catch { /* noop */ }
    return salida;
  }

  window.MAUOcrEngine = {
    extraerTextoPorPagina,
    renderizarPaginas,
    contarPaginasPdf,
    asegurarPdfJs
  };
})();
