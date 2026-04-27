/**
 * Modal de selección manual con miniaturas.
 *
 * API pública:
 *   window.MAUModalSeleccion.abrir({
 *     file: File,
 *     requerimientos: [{ nombre: string, link?: HTMLElement }],
 *     textosPorPagina?: Array<{pagina, id, etiqueta, cuil, apellido, nombre, patente, periodo}>,
 *     onConfirm: async (bloques) => void
 *   });
 *
 * Cada bloque devuelto tiene la forma:
 *   { nombre, paginas:number[], requerimientos:string[], meta:{cuil,apellido,nombre,patente,periodo} }
 */
(function () {
  const CSS = `
  .mau-modal-bg {
    position: fixed; inset: 0; background: rgba(0,0,0,.55);
    z-index: 2147483000; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }
  .mau-modal {
    background: #fff; width: 95vw; height: 92vh; border-radius: 10px;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
  }
  .mau-modal-header {
    padding: 12px 18px; background: #0f8a4c; color: #fff;
    display: flex; align-items: center; justify-content: space-between;
  }
  .mau-modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .mau-modal-header button {
    background: transparent; color: #fff; border: 1px solid #fff;
    border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 13px;
  }
  .mau-modal-body { flex: 1; display: flex; overflow: hidden; }
  .mau-modal-left {
    width: 70%; padding: 14px; overflow-y: auto; background: #f4f5f7;
    border-right: 1px solid #d0d4d8;
  }
  .mau-modal-right {
    width: 30%; padding: 14px; overflow-y: auto; background: #fff;
    display: flex; flex-direction: column; gap: 10px;
  }
  .mau-modal-footer {
    padding: 10px 18px; border-top: 1px solid #d0d4d8; background: #f9f9fa;
    display: flex; gap: 10px; justify-content: flex-end;
  }
  .mau-modal-footer button {
    padding: 8px 16px; border-radius: 5px; border: 1px solid #c0c4c8;
    background: #fff; cursor: pointer; font-size: 13px;
  }
  .mau-modal-footer .mau-btn-primary {
    background: #0f8a4c; color: #fff; border-color: #0f8a4c; font-weight: 600;
  }
  .mau-modal-footer button:disabled { opacity: .55; cursor: not-allowed; }

  .mau-thumbs {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .mau-thumb {
    background: #fff; border: 2px solid #d0d4d8; border-radius: 6px;
    padding: 6px; cursor: pointer; position: relative; user-select: none;
    display: flex; flex-direction: column; align-items: center;
    transition: border-color .1s, background .1s;
  }
  .mau-thumb:hover { border-color: #87b3ff; }
  .mau-thumb.sel { border-color: #1e66d1; background: #e8f0ff; }
  .mau-thumb.asignada { opacity: .65; }
  .mau-thumb canvas { max-width: 100%; height: auto; display: block; }
  .mau-thumb-num {
    position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,.72);
    color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600;
  }
  .mau-thumb-tag {
    margin-top: 4px; font-size: 11px; color: #444; text-align: center; line-height: 1.2;
    max-height: 28px; overflow: hidden;
  }
  .mau-thumb-bloque { display: none; }
  .mau-thumb-check {
    position: absolute; top: 30px; left: 4px;
    width: 17px; height: 17px; cursor: pointer; z-index: 1;
    opacity: 0; transition: opacity .15s;
  }
  .mau-thumb:hover .mau-thumb-check,
  .mau-thumb.sel .mau-thumb-check { opacity: 1; }
  .mau-thumb-eye {
    position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.55);
    color: #fff; border: none; border-radius: 3px; width: 22px; height: 22px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 13px; padding: 0; opacity: 0; transition: opacity .15s; z-index: 1;
  }
  .mau-thumb:hover .mau-thumb-eye { opacity: 1; }
  .mau-preview-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.88);
    display: flex; align-items: center; justify-content: center;
    z-index: 2147484000; overflow: hidden;
  }
  .mau-preview-img-wrap {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    cursor: grab; user-select: none;
  }
  .mau-preview-img-wrap.dragging { cursor: grabbing; }
  .mau-preview-overlay img {
    border-radius: 4px; box-shadow: 0 8px 40px rgba(0,0,0,.7);
    transform-origin: center center; pointer-events: none;
    max-width: none; max-height: none;
  }
  .mau-preview-toolbar {
    position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px;
    background: rgba(0,0,0,.55); border-radius: 20px; padding: 5px 12px;
  }
  .mau-preview-toolbar button {
    background: transparent; border: none; color: #fff; font-size: 18px;
    cursor: pointer; padding: 0 4px; line-height: 1;
  }
  .mau-preview-toolbar button:hover { color: #adf; }
  .mau-preview-zoom-label {
    color: #fff; font-size: 12px; min-width: 38px; text-align: center;
  }
  .mau-preview-close {
    position: absolute; top: 14px; right: 20px; background: transparent;
    border: none; color: #fff; font-size: 32px; line-height: 1;
    cursor: pointer; font-weight: 300;
  }
  .mau-preview-label {
    position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,.6); color: #fff; font-size: 13px;
    padding: 4px 14px; border-radius: 20px; white-space: nowrap;
  }

  .mau-right-title { font-weight: 600; font-size: 13px; margin: 0; color: #222; }
  .mau-sel-info { font-size: 12px; color: #555; }
  .mau-crear-bloque {
    padding: 8px 12px; border-radius: 5px; border: 1px solid #0f8a4c;
    background: #0f8a4c; color: #fff; cursor: pointer; font-weight: 600; font-size: 13px;
  }
  .mau-crear-bloque:disabled { background: #aacdb6; border-color: #aacdb6; cursor: not-allowed; }

  .mau-bloques { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .mau-bloque {
    border: 2px solid #d0d4d8; border-radius: 6px; padding: 8px; background: #fafbfc;
    font-size: 12px; transition: border-color .15s, background .15s;
  }
  .mau-bloque.activo {
    border-color: #1e66d1; background: #eef4ff;
  }
  .mau-bloque header {
    display: flex; justify-content: space-between; align-items: center; gap: 6px;
    margin-bottom: 4px;
  }
  .mau-bloque header strong { font-size: 12px; color: #0f8a4c; }
  .mau-bloque header button {
    background: transparent; border: none; color: #c33; cursor: pointer; font-size: 14px;
    padding: 0 4px;
  }
  .mau-bloque input[type=text] {
    width: 100%; padding: 4px 6px; border: 1px solid #c0c4c8; border-radius: 3px;
    font-size: 12px; margin-bottom: 4px;
  }
  .mau-bloque .mau-paginas { font-size: 11px; color: #555; margin-bottom: 4px; }
  .mau-bloque .mau-meta {
    font-size: 11px; color: #666; margin-bottom: 4px; padding: 3px 5px;
    background: #f0f0f0; border-radius: 3px;
  }
  .mau-bloque label { font-size: 11px; color: #333; display: block; margin-top: 3px; }
  .mau-req-search {
    width: 100%; padding: 4px 6px; border: 1px solid #c0c4c8; border-radius: 3px;
    font-size: 11px; margin-bottom: 3px; box-sizing: border-box;
  }
  .mau-req-list {
    max-height: 130px; overflow-y: auto; border: 1px solid #d0d4d8; border-radius: 4px;
    padding: 4px; background: #fff;
  }
  .mau-req-list label {
    display: flex; align-items: center; gap: 4px; padding: 2px 0;
    cursor: pointer; font-size: 11px;
  }
  .mau-req-list input[type=checkbox] { margin: 0; }
  `;

  let cssInyectado = false;
  function inyectarCss() {
    if (cssInyectado) return;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    cssInyectado = true;
  }

  // --------- estado del modal ---------
  const ctx = {
    file: null,
    numPaginas: 0,
    textosPorPagina: [],
    seleccion: new Set(),
    bloques: [],
    requerimientos: [],
    bloquesIniciales: [],
    nombrePatron: "",
    onConfirm: null,
    root: null
  };

  function limpiar() {
    ctx.file = null;
    ctx.numPaginas = 0;
    ctx.textosPorPagina = [];
    ctx.seleccion.clear();
    ctx.bloques = [];
    ctx.requerimientos = [];
    ctx.bloquesIniciales = [];
    ctx.nombrePatron = "";
    ctx.onConfirm = null;
    if (ctx.root) {
      ctx.root.remove();
      ctx.root = null;
    }
  }

  async function abrir({ file, requerimientos, textosPorPagina, bloquesIniciales, nombrePatron, onConfirm }) {
    if (!file) throw new Error("Falta el archivo.");
    inyectarCss();
    ctx.file = file;
    ctx.requerimientos = Array.isArray(requerimientos) ? requerimientos : [];
    ctx.textosPorPagina = Array.isArray(textosPorPagina) ? textosPorPagina : [];
    ctx.bloquesIniciales = Array.isArray(bloquesIniciales) ? bloquesIniciales : [];
    ctx.nombrePatron = nombrePatron || "";
    ctx.onConfirm = typeof onConfirm === "function" ? onConfirm : null;
    ctx.seleccion = new Set();
    ctx.bloques = [];

    renderShell();
    await renderThumbnails();
    renderPanelDerecho();
    if (ctx.bloquesIniciales.length) cargarBloquesIniciales();
  }

  function siguienteId() {
    const usados = new Set(ctx.bloques.map((b) => b.id));
    let n = 1;
    while (usados.has(n)) n++;
    return n;
  }

  function cargarBloquesIniciales() {
    ctx.bloques = ctx.bloquesIniciales.map((b, i) => ({
      id: i + 1,
      nombre: b.nombre || "Bloque",
      paginas: [...(b.paginas || [])],
      requerimientos: [...(b.requerimientos || [])],
      meta: b.meta || {}
    }));
    renderBloques();
    refrescarSeleccionVisual();
  }

  function renderShell() {
    const root = document.createElement("div");
    root.className = "mau-modal-bg";
    root.innerHTML = `
      <div class="mau-modal">
        <header class="mau-modal-header">
          <h2>Dividir y asignar — ${escapeHtml(ctx.file.name)}</h2>
          <button data-accion="cerrar">Cerrar ✕</button>
        </header>
        <div class="mau-modal-body">
          <div class="mau-modal-left">
            <div class="mau-thumbs" id="mau-modal-thumbs"></div>
          </div>
          <aside class="mau-modal-right" id="mau-modal-right"></aside>
        </div>
        <footer class="mau-modal-footer">
          <button data-accion="cancelar">Cancelar</button>
          <button class="mau-btn-primary" data-accion="confirmar">Confirmar y subir</button>
        </footer>
      </div>
    `;
    document.body.appendChild(root);
    ctx.root = root;

    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-accion]");
      if (!btn) return;
      const accion = btn.dataset.accion;
      if (accion === "cerrar" || accion === "cancelar") limpiar();
      if (accion === "confirmar") confirmar();
    });
  }

  async function renderThumbnails() {
    const cont = ctx.root.querySelector("#mau-modal-thumbs");
    cont.textContent = "Cargando miniaturas…";

    if (!window.pdfjsLib) {
      if (window.MAUOcrEngine?.asegurarPdfJs) await window.MAUOcrEngine.asegurarPdfJs();
    }
    const data = new Uint8Array(await ctx.file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    ctx.numPaginas = pdf.numPages;
    cont.textContent = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx2d = canvas.getContext("2d");
      ctx2d.fillStyle = "#fff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx2d, viewport }).promise;

      const info = ctx.textosPorPagina.find((t) => t.pagina === i) || {};
      const etiqueta = info.etiqueta || info.texto || "";
      const meta = [info.apellido, info.patente].filter(Boolean).join(" · ");

      const div = document.createElement("div");
      div.className = "mau-thumb";
      div.dataset.pagina = String(i);
      div.dataset.label = [etiqueta, meta].filter(Boolean).join(" — ") || "Sin identificar";
      div.innerHTML = `<span class="mau-thumb-num">${i}</span>`;
      div.appendChild(canvas);

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "mau-thumb-check";
      chk.title = "Seleccionar página";
      chk.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (chk.checked) ctx.seleccion.add(i);
        else ctx.seleccion.delete(i);
        ultimoClic = i;
        refrescarSeleccionVisual();
        actualizarInfoSeleccion();
      });
      div.appendChild(chk);

      const eyeBtn = document.createElement("button");
      eyeBtn.className = "mau-thumb-eye";
      eyeBtn.title = "Ver página completa";
      eyeBtn.innerHTML = "&#128065;";
      const pageLabel = [etiqueta, meta].filter(Boolean).join(" — ") || "Sin identificar";
      eyeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        abrirPreview(canvas.toDataURL(), i, pageLabel);
      });
      div.appendChild(eyeBtn);

      const tag = document.createElement("div");
      tag.className = "mau-thumb-tag";
      tag.textContent = pageLabel;
      div.appendChild(tag);

      div.addEventListener("click", (ev) => manejarClicThumb(ev, i));
      cont.appendChild(div);
    }
    try { pdf.destroy(); } catch (_e) { /* noop */ }
  }

  let ultimoClic = null;
  function manejarClicThumb(ev, pagina) {
    const bloquesDeEstaPagina = ctx.bloques.filter((b) => b.paginas.includes(pagina));
    const paginasDeLosBloques = () => {
      const set = new Set();
      for (const b of bloquesDeEstaPagina) b.paginas.forEach(p => set.add(p));
      return set;
    };

    if (ev.shiftKey && ultimoClic != null) {
      const desde = Math.min(ultimoClic, pagina);
      const hasta = Math.max(ultimoClic, pagina);
      for (let i = desde; i <= hasta; i++) ctx.seleccion.add(i);
    } else if (ev.ctrlKey || ev.metaKey) {
      if (bloquesDeEstaPagina.length > 0) {
        const todas = paginasDeLosBloques();
        const todasSel = [...todas].every((p) => ctx.seleccion.has(p));
        for (const p of todas) {
          if (todasSel) ctx.seleccion.delete(p); else ctx.seleccion.add(p);
        }
      } else {
        if (ctx.seleccion.has(pagina)) ctx.seleccion.delete(pagina);
        else ctx.seleccion.add(pagina);
      }
      ultimoClic = pagina;
    } else {
      // Click simple = toggle (igual que el checkbox), sin borrar el resto
      if (bloquesDeEstaPagina.length > 0) {
        const todas = paginasDeLosBloques();
        const todasSel = [...todas].every((p) => ctx.seleccion.has(p));
        for (const p of todas) {
          if (todasSel) ctx.seleccion.delete(p); else ctx.seleccion.add(p);
        }
      } else {
        if (ctx.seleccion.has(pagina)) ctx.seleccion.delete(pagina);
        else ctx.seleccion.add(pagina);
      }
      ultimoClic = pagina;
    }
    refrescarSeleccionVisual();
    actualizarInfoSeleccion();
  }

  function abrirPreview(dataUrl, numPagina, label) {
    const overlay = document.createElement("div");
    overlay.className = "mau-preview-overlay";
    overlay.innerHTML = `
      <div class="mau-preview-img-wrap">
        <img src="${dataUrl}" alt="Página ${numPagina}" />
      </div>
      <div class="mau-preview-toolbar">
        <button class="mau-zoom-out" title="Alejar">−</button>
        <span class="mau-preview-zoom-label">100%</span>
        <button class="mau-zoom-in" title="Acercar">+</button>
        <button class="mau-zoom-reset" title="Restablecer" style="font-size:13px;">⟳</button>
      </div>
      <button class="mau-preview-close" title="Cerrar">&times;</button>
      <div class="mau-preview-label">Página ${numPagina} — ${label}</div>
    `;

    const wrap = overlay.querySelector(".mau-preview-img-wrap");
    const img  = overlay.querySelector("img");
    const lbl  = overlay.querySelector(".mau-preview-zoom-label");
    let scale = 1, tx = 0, ty = 0;

    function aplicar(animate) {
      img.style.transition = animate ? "transform .15s" : "none";
      img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      lbl.textContent = Math.round(scale * 100) + "%";
    }

    function cambiarZoom(delta, cx, cy) {
      const prev = scale;
      scale = Math.min(8, Math.max(0.2, scale * (1 + delta)));
      // Zoom centrado en el punto del cursor
      const r = scale / prev;
      tx = cx + (tx - cx) * r;
      ty = cy + (ty - cy) * r;
      aplicar(false);
    }

    // Rueda del mouse
    overlay.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top  - rect.height / 2;
      cambiarZoom(e.deltaY < 0 ? 0.15 : -0.15, cx, cy);
    }, { passive: false });

    // Botones toolbar
    const centro = () => ({ cx: 0, cy: 0 });
    overlay.querySelector(".mau-zoom-in").addEventListener("click",    (e) => { e.stopPropagation(); cambiarZoom(0.25, 0, 0); });
    overlay.querySelector(".mau-zoom-out").addEventListener("click",   (e) => { e.stopPropagation(); cambiarZoom(-0.25, 0, 0); });
    overlay.querySelector(".mau-zoom-reset").addEventListener("click", (e) => { e.stopPropagation(); scale=1; tx=0; ty=0; aplicar(true); });

    // Drag para mover cuando hay zoom
    let drag = null;
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX - tx, y: e.clientY - ty };
      wrap.classList.add("dragging");
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      tx = e.clientX - drag.x;
      ty = e.clientY - drag.y;
      aplicar(false);
    });
    window.addEventListener("mouseup", () => { drag = null; wrap.classList.remove("dragging"); });

    // Cerrar
    overlay.querySelector(".mau-preview-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
    });

    // Tamaño inicial: ajustar al 88% del viewport
    img.onload = () => {
      const fitScale = Math.min((window.innerWidth * 0.88) / img.naturalWidth,
                                (window.innerHeight * 0.88) / img.naturalHeight, 1);
      scale = fitScale; tx = 0; ty = 0;
      aplicar(false);
    };

    document.body.appendChild(overlay);
  }

  function refrescarSeleccionVisual() {
    ctx.root.querySelectorAll(".mau-thumb").forEach((el) => {
      const pag = parseInt(el.dataset.pagina, 10);
      const esSel = ctx.seleccion.has(pag);
      el.classList.toggle("sel", esSel);
      const chk = el.querySelector(".mau-thumb-check");
      if (chk) chk.checked = esSel;

      // mostrar etiquetas de todos los bloques a los que pertenece esta página
      const bloquesDeEsta = ctx.bloques
        .map((b, idx) => ({ b, idx }))
        .filter(({ b }) => b.paginas.includes(pag));
      el.classList.toggle("asignada", bloquesDeEsta.length > 0);
      const tagEl = el.querySelector(".mau-thumb-tag");
      if (tagEl) {
        if (bloquesDeEsta.length > 0) {
          tagEl.textContent = bloquesDeEsta.map(({ b }) => `Bloque ${b.id}`).join(" · ");
          tagEl.style.color = "#0f8a4c";
          tagEl.style.fontWeight = "600";
        } else {
          tagEl.textContent = el.dataset.label || "Sin identificar";
          tagEl.style.color = "";
          tagEl.style.fontWeight = "";
        }
      }
    });

    // resaltar bloques en el panel derecho cuyos pages están en la selección
    ctx.root.querySelectorAll(".mau-bloque").forEach((el) => {
      const idStr = el.querySelector("button[data-borrar]")?.dataset.borrar;
      if (!idStr) return;
      const b = ctx.bloques.find((x) => x.id === parseInt(idStr, 10));
      const activo = b && b.paginas.some((p) => ctx.seleccion.has(p));
      el.classList.toggle("activo", !!activo);
    });
  }

  function actualizarInfoSeleccion() {
    const info = ctx.root.querySelector("#mau-sel-info");
    if (!info) return;
    const n = ctx.seleccion.size;
    info.textContent = n === 0 ? "Ninguna página seleccionada" : `${n} página(s) seleccionada(s): ${[...ctx.seleccion].sort((a,b)=>a-b).join(", ")}`;
    const btn = ctx.root.querySelector("#mau-crear-bloque");
    if (btn) btn.disabled = n === 0;
  }

  function renderPanelDerecho() {
    const right = ctx.root.querySelector("#mau-modal-right");
    const tagPatron = ctx.nombrePatron
      ? `<p style="font-size:11px;color:#38bdf8;margin:0 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(ctx.nombrePatron)}">📋 ${escapeHtml(ctx.nombrePatron)}</p>`
      : "";
    right.innerHTML = `
      ${tagPatron}
      <p class="mau-right-title">Selección</p>
      <div class="mau-sel-info" id="mau-sel-info">Ninguna página seleccionada</div>
      <button class="mau-crear-bloque" id="mau-crear-bloque" disabled>+ Crear bloque con selección</button>
      <p class="mau-right-title" style="margin-top:10px;">Bloques armados</p>
      <div class="mau-bloques" id="mau-bloques-list"></div>
    `;
    right.querySelector("#mau-crear-bloque").addEventListener("click", crearBloqueConSeleccion);
    actualizarInfoSeleccion();
    renderBloques();
  }

  function crearBloqueConSeleccion() {
    if (!ctx.seleccion.size) return;
    const paginas = [...ctx.seleccion].sort((a, b) => a - b);

    // Calcular meta consolidado desde textosPorPagina
    const meta = consolidarMeta(paginas);
    const nombreSugerido = sugerirNombreBloque(paginas, meta);

    ctx.bloques.push({
      id: siguienteId(),
      nombre: nombreSugerido,
      paginas,
      requerimientos: [],
      meta
    });

    ctx.seleccion.clear();
    refrescarSeleccionVisual();
    actualizarInfoSeleccion();
    renderBloques();
  }

  function consolidarMeta(paginas) {
    const meta = { cuil: "", apellido: "", nombre: "", patente: "", periodo: "", tiposDetectados: [] };
    for (const p of paginas) {
      const info = ctx.textosPorPagina.find((t) => t.pagina === p);
      if (!info) continue;
      if (!meta.cuil && info.cuil) meta.cuil = info.cuil;
      if (!meta.apellido && info.apellido) meta.apellido = info.apellido;
      if (!meta.nombre && info.nombre) meta.nombre = info.nombre;
      if (!meta.patente && info.patente) meta.patente = info.patente;
      if (!meta.periodo && info.periodo) meta.periodo = info.periodo;
      if (info.id && !meta.tiposDetectados.includes(info.id)) meta.tiposDetectados.push(info.id);
    }
    return meta;
  }

  function sugerirNombreBloque(paginas, meta) {
    const primera = ctx.textosPorPagina.find((t) => t.pagina === paginas[0]);
    const base = primera?.etiqueta || "Bloque";
    const extras = [];
    if (meta.apellido || meta.nombre) extras.push(`${meta.apellido || ""} ${meta.nombre || ""}`.trim());
    if (meta.patente) extras.push(`patente ${meta.patente}`);
    return extras.length ? `${base} — ${extras.join(" · ")}` : base;
  }

  function renderBloques() {
    const cont = ctx.root.querySelector("#mau-bloques-list");
    if (!cont) return;
    cont.innerHTML = "";
    if (!ctx.bloques.length) {
      cont.innerHTML = `<div style="font-size:11px;color:#888;">Todavía no armaste ningún bloque. Seleccioná páginas a la izquierda y apretá <em>Crear bloque</em>.</div>`;
      return;
    }
    for (const b of ctx.bloques) {
      const div = document.createElement("div");
      div.className = "mau-bloque";
      const metaStr = [
        b.meta.apellido && `Apellido: ${b.meta.apellido}`,
        b.meta.cuil && `CUIL: ${b.meta.cuil}`,
        b.meta.patente && `Patente: ${b.meta.patente}`,
        b.meta.periodo && `Período: ${b.meta.periodo}`
      ].filter(Boolean).join(" · ");

      // Detectar nombres duplicados para generar UIDs compuestos.
      const conteoNombres = {};
      (ctx.requerimientos || []).forEach((r) => { conteoNombres[r.nombre] = (conteoNombres[r.nombre] || 0) + 1; });
      const uidReq = (r) => {
        if (conteoNombres[r.nombre] > 1 && r.recurso?.apellido) return `${r.nombre}||${r.recurso.apellido}`;
        return r.nombre;
      };

      const reqsHtml = (ctx.requerimientos || []).map((r) => {
        const uid = uidReq(r);
        const checked = (b.requerimientos.includes(uid) || (uid !== r.nombre && b.requerimientos.includes(r.nombre))) ? "checked" : "";
        const recursoLabel = r.recurso && (r.recurso.apellido || r.recurso.nombre)
          ? ` <span style="color:#888;font-size:11px;">${[r.recurso.apellido, r.recurso.nombre].filter(Boolean).join(" ")}</span>`
          : "";
        const labelTexto = conteoNombres[r.nombre] > 1
          ? `${escapeHtml(r.nombre)}${recursoLabel || " <span style=\"color:#888;font-size:11px;\">(sin datos de recurso)</span>"}`
          : `${escapeHtml(r.nombre)}${recursoLabel}`;
        return `<label><input type="checkbox" data-req="${escapeHtml(uid)}" ${checked}/> ${labelTexto}</label>`;
      }).join("") || `<div style="font-size:11px;color:#888;">No hay requerimientos detectados en la bandeja.</div>`;

      div.innerHTML = `
        <header>
          <strong>Bloque #${b.id}</strong>
          <button data-borrar="${b.id}" title="Borrar bloque">✕</button>
        </header>
        <input type="text" data-nombre="${b.id}" value="${escapeHtml(b.nombre)}" />
        <div class="mau-paginas">Páginas: ${b.paginas.join(", ")}</div>
        ${metaStr ? `<div class="mau-meta">${escapeHtml(metaStr)}</div>` : ""}
        <label>Subir a estos requerimientos:</label>
        <input type="text" class="mau-req-search" data-buscar="${b.id}" placeholder="Buscar requerimiento…" />
        <div class="mau-req-list" data-reqs="${b.id}">${reqsHtml}</div>
      `;
      cont.appendChild(div);
    }

    cont.querySelectorAll("button[data-borrar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.borrar, 10);
        ctx.bloques = ctx.bloques.filter((b) => b.id !== id);
        renderBloques();
        refrescarSeleccionVisual();
      });
    });
    cont.querySelectorAll("input[data-nombre]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const id = parseInt(inp.dataset.nombre, 10);
        const b = ctx.bloques.find((x) => x.id === id);
        if (b) {
          b.nombre = inp.value;
          refrescarSeleccionVisual();
        }
      });
    });
    cont.querySelectorAll("input[data-buscar]").forEach((inp) => {
      const lista = cont.querySelector(`div[data-reqs="${inp.dataset.buscar}"]`);
      if (!lista) return;
      inp.addEventListener("input", () => {
        const q = inp.value.trim().toLowerCase();
        lista.querySelectorAll("label").forEach((lbl) => {
          lbl.style.display = !q || lbl.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    });

    cont.querySelectorAll("div[data-reqs]").forEach((div) => {
      const id = parseInt(div.dataset.reqs, 10);
      const b = ctx.bloques.find((x) => x.id === id);
      if (!b) return;
      div.querySelectorAll("input[type=checkbox]").forEach((chk) => {
        chk.addEventListener("change", () => {
          const uid = chk.dataset.req;
          const baseNombre = uid.split("||")[0];
          if (chk.checked) {
            if (!b.requerimientos.includes(uid)) b.requerimientos.push(uid);
          } else {
            // Eliminar uid y cualquier entrada legacy con el nombre base.
            b.requerimientos = b.requerimientos.filter((n) => n !== uid && n !== baseNombre);
          }
        });
      });
    });
  }

  async function confirmar() {
    // Validación básica
    const sinReq = ctx.bloques.filter((b) => !b.requerimientos.length && !esDesestimar(b));
    if (sinReq.length) {
      if (!confirm(`Hay ${sinReq.length} bloque(s) sin requerimiento asignado. ¿Querés confirmar igual? (se ignorarán)`)) return;
    }
    if (!ctx.bloques.length) {
      alert("Armá al menos un bloque antes de confirmar.");
      return;
    }

    const bloquesSalida = ctx.bloques
      .filter((b) => b.paginas.length && (b.requerimientos.length || esDesestimar(b)))
      .map((b) => ({
        nombre: b.nombre,
        paginas: [...b.paginas].sort((a, b) => a - b),
        requerimientos: [...b.requerimientos],
        meta: { ...b.meta }
      }));

    const onConfirm = ctx.onConfirm;
    const numPaginas = ctx.numPaginas;
    limpiar();
    if (onConfirm) {
      try { await onConfirm(bloquesSalida, numPaginas); }
      catch (e) { console.error("[MAU modal] onConfirm error:", e); alert("Error al procesar: " + (e?.message || e)); }
    }
  }

  function esDesestimar(b) {
    const nom = (b.nombre || "").toLowerCase();
    return nom.includes("desestimar") || nom.includes("descartar");
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  window.MAUModalSeleccion = { abrir };
})();
