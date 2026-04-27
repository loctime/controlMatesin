(function () {
  const estado = {
    requerimientos: [],
    filas: [],
    nextFilaId: 1,
    ultFilaNuevaId: null,
    ultimaAlerta: { mensaje: "", ts: 0 },
    sabanaPendiente: null,
    sabanaContexto: null
  };
  // DEBUG: exponer estado para diagnóstico desde consola
  window.__MAU_DEBUG__ = { estado };

  // Set logo src from extension resources
  const logoEl = document.getElementById("mau-logo");
  if (logoEl && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    logoEl.src = chrome.runtime.getURL("icons/icon128.png");
  }

  const ui = {
    panel: document.getElementById("docauto-panel"),
    minimizar: document.getElementById("mau-minimizar"),
    // Modo trabajar
    modoTrabajar: document.getElementById("mau-modo-trabajar"),
    modoSabana: document.getElementById("mau-modo-sabana"),
    tabTrabajar: document.getElementById("mau-tab-trabajar"),
    tabSabana: document.getElementById("mau-tab-sabana"),
    dropzone: document.getElementById("mau-dropzone"),
    seleccionar: document.getElementById("mau-seleccionar"),
    fileInput: document.getElementById("mau-file-input"),
    detectar: document.getElementById("mau-detectar"),
    tabla: document.getElementById("mau-tabla-body"),
    procesar: document.getElementById("mau-procesar"),
    pText: document.getElementById("mau-progress-text"),
    pInner: document.getElementById("mau-progress-inner"),
    // Modo sábana
    abrirMapeo: document.getElementById("mau-abrir-mapeo"),
    sabanaWrap: document.getElementById("mau-sabana-wrap"),
    sabanaEditor: document.getElementById("mau-sabana-editor"),
    patronNombre: document.getElementById("mau-patron-nombre"),
    sabanaTablaBody: document.getElementById("mau-sabana-tabla-body"),
    sabanaConfirmar: document.getElementById("mau-sabana-confirmar"),
    sabanaCancelar: document.getElementById("mau-sabana-cancelar"),
    pTextSabana: document.getElementById("mau-progress-text-sabana"),
    pInnerSabana: document.getElementById("mau-progress-inner-sabana"),
    toast: document.getElementById("mau-toast")
  };

  if (!ui.panel) return;
  instalarInterceptorAlertasNativas();

  // ── Tabs de modo ──
  function activarTab(modo) {
    const esTrab = modo === "trabajar";
    ui.modoTrabajar.hidden = !esTrab;
    ui.modoSabana.hidden = esTrab;
    ui.tabTrabajar.classList.toggle("mau-tab-active", esTrab);
    ui.tabSabana.classList.toggle("mau-tab-active", !esTrab);
  }
  if (ui.tabTrabajar) ui.tabTrabajar.addEventListener("click", () => activarTab("trabajar"));
  if (ui.tabSabana) ui.tabSabana.addEventListener("click", () => activarTab("sabana"));


  ui.minimizar.addEventListener("click", () => {
    const body = ui.panel.querySelector(".mau-body");
    body.style.display = body.style.display === "none" ? "block" : "none";
  });
  ui.detectar.addEventListener("click", detectarRequerimientosPendientes);
  ui.procesar.addEventListener("click", procesarTodo);
  if (ui.abrirMapeo) ui.abrirMapeo.addEventListener("click", abrirGestorMapeo);

  if (ui.sabanaConfirmar) ui.sabanaConfirmar.addEventListener("click", confirmarPatronSabana);
  if (ui.sabanaCancelar) ui.sabanaCancelar.addEventListener("click", cancelarEditorSabana);
  ui.seleccionar.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", async () => {
    const archivos = [...(ui.fileInput.files || [])].filter((f) => /pdf$/i.test(f.name));
    if (!archivos.length) return;
    await procesarArchivosPdf(archivos, "input:file");
    ui.fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    ui.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.dropzone.classList.add("mau-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    ui.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.dropzone.classList.remove("mau-over");
    })
  );
  ui.dropzone.addEventListener("drop", manejarDrop);
  instalarBloqueoGlobalDrop();

  /**
   * Detecta el índice de la columna "Recurso" a partir de los headers de la tabla.
   * Retorna -1 si no se encuentra.
   */
  /**
   * Detecta el índice de la columna "Recurso" buscando en headers de la tabla.
   * Prueba múltiples estrategias porque el sitio puede usar <th>, <td> en thead, o <td> en una fila normal.
   */
  function detectarIndiceColumnaRecurso() {
    // Estrategia 1: buscar en <th>
    const ths = Array.from(document.querySelectorAll("th"));
    for (let i = 0; i < ths.length; i++) {
      if (/recurso/i.test(textoPlano(ths[i].textContent))) return i;
    }
    // Estrategia 2: buscar en cualquier fila que contenga "Recurso" y "Requerimiento" (fila header)
    const filas = Array.from(document.querySelectorAll("tr"));
    for (const tr of filas) {
      const celdas = tr.querySelectorAll("td, th");
      const textoFila = textoPlano(tr.textContent);
      if (/recurso/i.test(textoFila) && /requerimiento/i.test(textoFila)) {
        for (let i = 0; i < celdas.length; i++) {
          if (/recurso/i.test(textoPlano(celdas[i].textContent))) return i;
        }
      }
    }
    return -1;
  }

  /**
   * Extrae info del Recurso desde una celda <td>: nombre del empleado, CUIL, contrato, etc.
   * Retorna un objeto { textoCompleto, apellido, nombre, cuil, contrato }.
   */
  function parsearRecurso(td) {
    if (!td) return { textoCompleto: "", apellido: "", nombre: "", cuil: "", contrato: "" };
    const textoCompleto = textoPlano(td.textContent);
    if (!textoCompleto) return { textoCompleto: "", apellido: "", nombre: "", cuil: "", contrato: "" };
    // El recurso tiene formato:
    //   "FERNANDEZ ENRIQUE DARIO Argentina - Empleador: 20209995124 Contrato: Planta RAM"
    //   Puede tener un <a> con el nombre, o puede ser texto plano.
    const linkRecurso = td.querySelector("a");
    let nombreCompleto = linkRecurso ? textoPlano(linkRecurso.textContent) : "";
    // Si no hay link, extraer la primera línea del texto (que es el nombre del empleado).
    // La primera línea viene antes de "Argentina", "Empleador", "Contrato", etc.
    if (!nombreCompleto) {
      // Usar innerText para respetar saltos de línea del DOM.
      const lineas = (td.innerText || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
      if (lineas.length > 0) {
        // La primera línea suele ser el nombre (ej: "FERNANDEZ ENRIQUE DARIO")
        const primeraLinea = lineas[0];
        // Verificar que parece un nombre (al menos 2 palabras en mayúsculas, no "Argentina", no "Empleador")
        if (/^[A-ZÁÉÍÓÚÑ\s]{4,}$/.test(primeraLinea) && !/argentina|empleador|contrato/i.test(primeraLinea)) {
          nombreCompleto = primeraLinea;
        }
      }
    }
    // Extraer CUIL/CUIT del empleador si aparece.
    const cuilMatch = textoCompleto.match(/(?:Empleador|CUIT|CUIL)[:\s]*(\d{2}-?\d{7,8}-?\d)/i);
    const cuil = cuilMatch ? cuilMatch[1].replace(/-/g, "") : "";
    // Extraer contrato si aparece.
    const contratoMatch = textoCompleto.match(/Contrato[:\s]*(.+)/i);
    const contrato = contratoMatch ? contratoMatch[1].trim() : "";
    // Usar el nombre completo como apellido para poder desambiguar entre
    // "FERNANDEZ DIEGO ARIEL" y "FERNANDEZ ENRIQUE DARIO" correctamente.
    let apellido = "";
    let nombre = "";
    if (nombreCompleto) {
      apellido = nombreCompleto.trim(); // nombre completo, sin partir
      nombre = "";
    } else {
      // Fallback: extraer palabras en mayúsculas del texto completo
      const primeraMayus = textoCompleto.match(/\b([A-ZÁÉÍÓÚÑ]{3,})\b/);
      if (primeraMayus) apellido = primeraMayus[1];
    }
    return { textoCompleto, apellido, nombre, cuil, contrato };
  }

  // Lee los nombres del widget "Sobres activos" en la página del sistema.
  // Intenta múltiples estrategias porque el widget puede ser un <select>, una lista custom, etc.
  function leerNombresDesdeSobresActivos() {
    // Estrategia 1: buscar un <select> cuya etiqueta cercana diga "Sobres activos"
    for (const sel of document.querySelectorAll("select")) {
      const candidatos = [];
      // Buscar label asociado por for= o por texto cercano en el ancestro
      const id = sel.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label && /sobres\s*activos/i.test(label.textContent)) {
          candidatos.push(sel);
        }
      }
      // También revisar si el contenedor padre menciona "sobres activos"
      let parent = sel.parentElement;
      for (let i = 0; i < 4 && parent; i++, parent = parent.parentElement) {
        const txt = Array.from(parent.childNodes)
          .filter(n => n.nodeType === 3).map(n => n.textContent).join(" ");
        if (/sobres\s*activos/i.test(txt) || /sobres\s*activos/i.test(parent.textContent?.slice(0, 60) || "")) {
          candidatos.push(sel);
          break;
        }
      }
      if (candidatos.includes(sel) && sel.options.length > 0) {
        const nombres = Array.from(sel.options).map(o => textoPlano(o.textContent)).filter(Boolean);
        console.log(`[MAU] Sobres activos leídos desde <select>: ${nombres.length}`);
        return nombres;
      }
    }

    // Estrategia 2: buscar cualquier elemento de lista (ul/li o div/span) cerca de texto "Sobres activos"
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!/sobres\s*activos/i.test(node.textContent)) continue;
      // Encontrado el nodo de texto — subir hasta encontrar un contenedor con lista
      let container = node.parentElement;
      for (let i = 0; i < 6 && container; i++, container = container.parentElement) {
        const items = container.querySelectorAll("li, option");
        if (items.length >= 3) {
          const nombres = Array.from(items).map(el => textoPlano(el.textContent)).filter(Boolean);
          console.log(`[MAU] Sobres activos leídos desde lista cercana: ${nombres.length}`);
          return nombres;
        }
      }
    }

    console.log("[MAU] No se encontró el widget 'Sobres activos' en la página.");
    return [];
  }

  // Extrae todos los requerimientos de las filas de la tabla, sin filtrar por estado.
  // Devuelve Map<"nombre||apellido" → {nombre, link, recurso, ts}>
  function escanearFilasTabla(idxRecurso) {
    const candidatos = Array.from(document.querySelectorAll("tr")).filter((tr) => {
      const directTds = tr.querySelectorAll(":scope > td");
      return directTds.length >= 4 && !tr.querySelector("table");
    });
    const mapa = new Map();
    for (const tr of candidatos) {
      const link = tr.querySelector("a");
      if (!link) continue;
      const nombre = textoPlano(link.textContent);
      if (!nombre) continue;
      const celdas = tr.querySelectorAll(":scope > td");
      let recursoData = { textoCompleto: "", apellido: "", nombre: "", cuil: "", contrato: "" };
      if (idxRecurso >= 0 && celdas[idxRecurso]) {
        recursoData = parsearRecurso(celdas[idxRecurso]);
      } else {
        for (const td of celdas) {
          if (td.contains(link)) continue;
          const tdText = textoPlano(td.textContent);
          if (/[A-Z]{2,}\s+[A-Z]{2,}/i.test(tdText) && !/matesin/i.test(tdText)) {
            recursoData = parsearRecurso(td);
            break;
          }
        }
      }
      const fechaTxt = (tr.textContent.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/) || [])[1] || "";
      // Usar el href del link como clave primaria: cada fila del sitio tiene URL única,
      // lo que evita que filas con mismo nombre de requerimiento se sobreescriban cuando
      // parsearRecurso no puede extraer el apellido del empleado.
      const clave = link.href || `${nombre}||${recursoData.apellido}||${recursoData.nombre}`.toLowerCase();
      const actual = mapa.get(clave);
      const ts = parsearFechaSitio(fechaTxt);
      if (!actual || ts > (actual.ts || 0)) {
        mapa.set(clave, { nombre, link, recurso: recursoData, ts });
      }
    }
    return mapa;
  }

  async function detectarRequerimientosPendientes() {
    const botonBuscar = Array.from(document.querySelectorAll("button, input[type=button], a"))
      .find((el) => /buscar/i.test(el.textContent || el.value || ""));
    if (botonBuscar) botonBuscar.click();

    await dormir(900);

    const idxRecurso = detectarIndiceColumnaRecurso();
    console.log(`[MAU] Índice columna Recurso: ${idxRecurso}`);

    const mapaTabla = escanearFilasTabla(idxRecurso);
    console.log(`[MAU] Filas en tabla (sin filtro estado): ${mapaTabla.size}`);

    const nombresSobre = leerNombresDesdeSobresActivos();
    let reqs;

    if (nombresSobre.length > 0) {
      // Fuente principal: lista de sobres activos de la página.
      // Para cada nombre, buscar entradas en la tabla (puede haber varias por recurso distinto).
      reqs = [];
      const vacios = { textoCompleto: "", apellido: "", nombre: "", cuil: "", contrato: "" };
      for (const nombre of nombresSobre) {
        // Match exacto primero; si no hay, match por prefijo (el sobre da el nombre corto
        // y la tabla incluye el período: "F 931" → "F 931-2026-3 (0/1)").
        let matches = Array.from(mapaTabla.values()).filter(e => e.nombre === nombre);
        if (!matches.length) {
          const prefijo = nombre.toLowerCase();
          matches = Array.from(mapaTabla.values()).filter(e => e.nombre.toLowerCase().startsWith(prefijo));
        }
        if (matches.length > 0) {
          reqs.push(...matches.map(m => ({ nombre: m.nombre, link: m.link, recurso: m.recurso })));
        } else {
          // El sobre existe en el widget pero no hay fila en la tabla visible ahora.
          // Se agrega igual para que aparezca en el modal; el link se buscará en vivo al subir.
          reqs.push({ nombre, link: null, recurso: vacios });
        }
      }
      console.log(`[MAU] Requerimientos desde sobres activos: ${reqs.length}`);
    } else {
      // Fallback: solo los que tienen "pend envío" (comportamiento anterior).
      reqs = Array.from(mapaTabla.values())
        .filter(e => {
          const tr = e.link?.closest("tr");
          return tr && /pend envio|pend envío/i.test(textoPlano(tr.textContent));
        })
        .map(e => ({ nombre: e.nombre, link: e.link, recurso: e.recurso }));
      console.log(`[MAU] Requerimientos (fallback pend envío): ${reqs.length}`);
    }

    estado.requerimientos = reqs;
    estado.filas = reqs.map((r) => ({
      id: estado.nextFilaId++,
      tipo: "requerimiento",
      requerimiento: r.nombre,
      recurso: r.recurso,
      archivo: null,
      estado: "pendiente"
    }));
    renderTabla();
  }

  async function manejarDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log("[MAU] Drop detectado en panel.");
    const archivosCrudos = [...(e.dataTransfer?.files || [])];
    console.log("[MAU] Archivos recibidos en drop:", archivosCrudos.map((f) => `${f.name} (${f.type || "sin-type"})`));
    const archivos = archivosCrudos.filter((f) => /pdf$/i.test(f.name));
    console.log("[MAU] PDFs filtrados:", archivos.map((f) => f.name));
    if (!archivos.length) {
      console.log("[MAU] No hay PDFs válidos en el drop.");
      return;
    }
    await procesarArchivosPdf(archivos, "drag-drop");
  }

  async function procesarArchivosPdf(archivos, origen) {
    console.log(`[MAU] [TRABAJAR] Procesando ${archivos.length} PDF(s). Origen: ${origen}`);
    if (!estado.requerimientos.length) await detectarRequerimientosPendientes();

    const patrones = (await window.MAUStorage.leerPatronesSabana()) || [];
    if (!patrones.length) {
      mostrarToast("No hay mapeo guardado. Primero subí una sábana en la pestaña «Subir sábana».");
      return;
    }

    // Cargar todos los mapeos disponibles con imágenes
    ui.pText.textContent = `Cargando mapeos disponibles…`;
    const referenciasDisponibles = [];
    for (const p of patrones) {
      if (!p.nombre) continue;
      const ref = await window.MAUImageDB.leerImagenesPatron(p.nombre);
      const tieneImagenes = (ref?.imagenesPorBloque && Object.keys(ref.imagenesPorBloque).length > 0)
        || (ref?.imagenes?.length > 0);
      if (tieneImagenes && ref?.bloques?.length) {
        referenciasDisponibles.push(ref);
      }
    }

    if (!referenciasDisponibles.length) {
      mostrarToast(`No hay mapeos con imágenes guardadas. Hacé un mapeo primero desde "Aprender".`);
      return;
    }

    console.log(`[MAU][TRABAJAR] ${referenciasDisponibles.length} mapeo(s) disponibles: ${referenciasDisponibles.map(r => r.nombre).join(", ")}`);

    for (const archivo of archivos) {
      console.log("[MAU] [TRABAJAR] Procesando:", archivo.name);
      ui.pText.textContent = `Preparando páginas de «${archivo.name}»…`;
      try {
        // Renderizar páginas una sola vez
        const nuevasPaginas = await window.MAUOcrEngine.renderizarPaginas(
          archivo,
          (info) => actualizarProgreso(info.pagina, info.totalPaginas, `Preparando página ${info.pagina}/${info.totalPaginas}…`),
          { escala: 120, calidad: 0.60 }
        );

        // Probar cada mapeo en orden hasta que uno machee
        let bloquesFinales = null;
        for (const ref of referenciasDisponibles) {
          ui.pText.textContent = `Macheando con "${ref.nombre}"…`;
          console.log(`[MAU][TRABAJAR] Probando mapeo "${ref.nombre}"…`);
          try {
            const resultado = await window.MAUStorage.compararConReferencia(nuevasPaginas, ref);
            if (resultado?.length) {
              console.log(`[MAU][TRABAJAR] ✅ Macheó con "${ref.nombre}": ${resultado.length} bloque(s)`);
              bloquesFinales = resultado;
              break;
            } else {
              console.log(`[MAU][TRABAJAR] "${ref.nombre}" no coincide, probando siguiente…`);
            }
          } catch (e) {
            console.warn(`[MAU][TRABAJAR] Error al machear con "${ref.nombre}":`, e);
          }
        }

        if (!bloquesFinales || !bloquesFinales.length) {
          mostrarToast(`El archivo es muy distinto al mapeado, revisá que sea el correcto.`);
          console.warn("[MAU][TRABAJAR] Sin resultado en ningún mapeo.");
          continue;
        }

        // ── Cortar el PDF y asignar cada bloque a sus requerimientos ──
        await window.MAUPdfSplitter.cargarLibreria(
          "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js", "PDFLib"
        );
        const bytes = await archivo.arrayBuffer();
        const src = await window.PDFLib.PDFDocument.load(bytes);

        for (const bloque of bloquesFinales) {
          const { paginas, requerimientos, meta } = bloque;
          if (!paginas?.length || !requerimientos?.length) continue;
          const nuevo = await window.PDFLib.PDFDocument.create();
          const indices = paginas.map((n) => n - 1).filter((i) => i >= 0 && i < src.getPageCount());
          if (!indices.length) continue;
          const pages = await nuevo.copyPages(src, indices);
          pages.forEach((p) => nuevo.addPage(p));
          const out = await nuevo.save();
          const nombreArchivo = `${archivo.name.replace(/\.pdf$/i, "")}-Bloque.pdf`;
          const archivoBloque = new File([out], nombreArchivo, { type: "application/pdf" });

          for (const req of requerimientos) {
            const copia = new File([await archivoBloque.arrayBuffer()], nombreArchivo, { type: "application/pdf" });
            asignarArchivoARequerimiento(req, copia, meta || null);
            console.log(`[MAU][TRABAJAR] Asignado a «${req}» — páginas: ${paginas.join(",")}`);
          }
        }

        mostrarToast(`«${archivo.name}» identificado y asignado. Revisá la tabla.`);

      } catch (err) {
        alertarErrorOcr(err);
      }
    }

    ui.pText.textContent = "Sin procesamiento en curso";
    ui.pInner.style.width = "0%";
    renderTabla();
  }

  // ── Flujo sábana (modo aprendizaje) — se activa desde la tab «Subir sábana» ──
  async function procesarArchivosPdfSabana(archivos, origen) {
    console.log(`[MAU] [SÁBANA] Procesando ${archivos.length} PDF(s). Origen: ${origen}`);
    if (!estado.requerimientos.length) await detectarRequerimientosPendientes();
    const memoria = await window.MAUStorage.leerMemoria();

    for (const archivo of archivos) {
      console.log("[MAU] Procesando sábana:", archivo.name);
      let numPag = 0;
      try {
        if (window.MAUOcrEngine?.contarPaginasPdf) numPag = await window.MAUOcrEngine.contarPaginasPdf(archivo);
      } catch (e) { console.warn("[MAU] No se pudo contar páginas:", e); }

      if (numPag > 1) {
        estado.sabanaPendiente = archivo;
        mostrarSeccionSabana(true);
        console.log("[MAU] PDF candidato a sábana (>4 páginas). Intentando reconocer patrón...", archivo.name);
        // Intento de auto-aplicar patrón aprendido sin abrir modal
        try {
          const patrones = (await window.MAUStorage.leerPatronesSabana()) || [];
          // DEBUG: mostrar patrones guardados para diagnóstico
          console.log(`[MAU][PATRONES] Patrones guardados: ${patrones.length}`);
          patrones.forEach((p, idx) => {
            console.log(`[MAU][PATRONES]   [${idx}] nombre="${p.nombre}" firmaTipos=[${(p.firmaTipos||[]).join(',')}]`);
            (p.bloquesModal || []).forEach((b, bi) => {
              console.log(`[MAU][PATRONES]     bloque[${bi}]: nombre="${b.nombre}" pags=[${(b.paginas||[]).join(',')}] reqs=[${(b.requerimientos||[]).join(' | ')}]`);
            });
          });
          if (patrones.length && window.MAUOcrEngine?.extraerTextoPorPagina) {
            if (!estado.requerimientos.length) await detectarRequerimientosPendientes();
            console.log("[MAU] Analizando texto de", patrones.length, "patrón(es) guardados...");
            const textos = await window.MAUOcrEngine.extraerTextoPorPagina(archivo, () => {});
            const firmaTipos = textos.map((t) => t.etiqueta || "desconocido");
            console.log("[MAU] Firma detectada:", firmaTipos.join(" | "));
            // Similitud multiset: fracción de tipos que coinciden (tolera páginas mal clasificadas)
            const similitudMultiset = (a, b) => {
              if (!Array.isArray(a) || !Array.isArray(b)) return 0;
              if (a.length !== b.length) return 0;
              const contB = {};
              for (const x of b) contB[x] = (contB[x] || 0) + 1;
              let matches = 0;
              for (const x of a) { if (contB[x] > 0) { matches++; contB[x]--; } }
              return matches / a.length;
            };
            // Buscar primero match exacto, luego match aproximado (≥70% tipos coinciden)
            const candidatos = patrones.filter(
              (p) => Array.isArray(p.firmaTipos) && Array.isArray(p.bloquesModal) && p.bloquesModal.length
            );
            const match = candidatos.find((p) => similitudMultiset(p.firmaTipos, firmaTipos) === 1) ||
                          candidatos.map((p) => ({ p, s: similitudMultiset(p.firmaTipos, firmaTipos) }))
                                    .filter((x) => x.s >= 0.70)
                                    .sort((a, b) => b.s - a.s)[0]?.p || null;
            if (match) {
              const sim = similitudMultiset(match.firmaTipos, firmaTipos);
              const esExacto = sim === 1;
              console.log(`[MAU] ✓ Patrón reconocido («${match.nombre}», similitud ${Math.round(sim * 100)}%). Aplicando…`);
              mostrarToast(`Patrón «${match.nombre}» reconocido${esExacto ? "" : ` (~${Math.round(sim * 100)}% match)`} y aplicado.`);
              // Remapear usando tipo primero y nombre/CUIL para desempatar bloques del mismo tipo.
              const bloquesRemapeados = remapearBloquesPorTexto(match.bloquesModal, textos, match.firmaTipos);
              console.log("[MAU] Bloques remapeados (por nombre+tipo):", bloquesRemapeados);
              await aplicarBloquesModal(archivo, bloquesRemapeados);
              continue;
            } else {
              console.log("[MAU] No hay patrón guardado que coincida con esta firma. Usá «Dividir manual con miniaturas».");
            }
          } else {
            console.log("[MAU] No hay patrones guardados todavía. Usá «Dividir manual con miniaturas».");
          }
        } catch (err) {
          console.warn("[MAU] Error al intentar auto-aplicar patrón:", err);
        }
        continue;
      }
      // PDF de 1 página en modo sábana → ignorar (no aplica)
    }
    renderTabla();
  }

  function mostrarSeccionSabana(visible) {
    if (ui.sabanaWrap) ui.sabanaWrap.hidden = !visible;
    if (visible && ui.sabanaEditor) ui.sabanaEditor.hidden = true;
  }

  function mostrarToast(mensaje) {
    if (!ui.toast) return;
    ui.toast.textContent = mensaje;
    ui.toast.hidden = false;
    clearTimeout(mostrarToast._t);
    mostrarToast._t = setTimeout(() => {
      ui.toast.hidden = true;
    }, 4500);
  }

  function alertarErrorOcr(e) {
    const msg = e?.message || String(e);
    const esApiKey = /api.?key|anthropic|cargala/i.test(msg);
    if (esApiKey) {
      mostrarToast("⚠️ API Key de Anthropic no configurada. Andá a Opciones de la extensión y cargala.");
      alert("Falta la API Key de Anthropic.\n\nAbrí las Opciones de la extensión y pegá tu clave para que Claude pueda leer los documentos.");
    } else {
      mostrarToast(`Error al procesar con Claude: ${msg}`);
    }
    console.error("[MAU] Error OCR:", e);
  }

  /**
   * Muestra un diálogo sí/no con el estilo del panel.
   * Devuelve true si el usuario eligió la primera opción (sí), false si la segunda (no).
   */
  function preguntarSiNo({ titulo, mensaje, labelSi = "Sí", labelNo = "No" }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "mau-confirm";
      const box = document.createElement("div");
      box.className = "mau-confirm-box";
      const h = document.createElement("div");
      h.style.fontWeight = "700";
      h.style.fontSize = "16px";
      h.style.marginBottom = "8px";
      h.textContent = titulo || "";
      const p = document.createElement("div");
      p.style.fontSize = "14px";
      p.style.lineHeight = "1.4";
      p.style.color = "#cbd5e1";
      p.textContent = mensaje || "";
      const actions = document.createElement("div");
      actions.className = "mau-confirm-actions";
      const btnSi = document.createElement("button");
      btnSi.type = "button";
      btnSi.textContent = labelSi;
      const btnNo = document.createElement("button");
      btnNo.type = "button";
      btnNo.textContent = labelNo;
      actions.appendChild(btnSi);
      actions.appendChild(btnNo);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const cerrar = (val) => {
        try { overlay.remove(); } catch (e) {}
        resolve(val);
      };
      btnSi.addEventListener("click", () => cerrar(true));
      btnNo.addEventListener("click", () => cerrar(false));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(false); });
    });
  }

  /**
   * Muestra un diálogo con múltiples opciones. Devuelve el id de la opción
   * elegida (o null si cancela haciendo click fuera).
   * @param {{titulo?: string, mensaje?: string, opciones: Array<{id: string, label: string, danger?: boolean}>}} config
   */
  function preguntarOpciones({ titulo, mensaje, opciones }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "mau-confirm";
      const box = document.createElement("div");
      box.className = "mau-confirm-box";
      if (titulo) {
        const h = document.createElement("div");
        h.style.fontWeight = "700";
        h.style.fontSize = "16px";
        h.style.marginBottom = "8px";
        h.textContent = titulo;
        box.appendChild(h);
      }
      if (mensaje) {
        const p = document.createElement("div");
        p.style.fontSize = "14px";
        p.style.lineHeight = "1.4";
        p.style.color = "#cbd5e1";
        p.style.marginBottom = "10px";
        p.textContent = mensaje;
        box.appendChild(p);
      }
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.flexDirection = "column";
      actions.style.gap = "8px";
      actions.style.marginTop = "14px";
      for (const op of opciones || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = op.label;
        btn.style.width = "100%";
        btn.style.padding = "11px";
        btn.style.border = "0";
        btn.style.borderRadius = "10px";
        btn.style.fontWeight = "600";
        btn.style.fontSize = "14px";
        btn.style.cursor = "pointer";
        if (op.danger) {
          btn.style.background = "rgba(248, 113, 113, 0.18)";
          btn.style.color = "#f87171";
          btn.style.border = "1px solid rgba(248, 113, 113, 0.3)";
        } else if (op.secondary) {
          btn.style.background = "rgba(148, 163, 184, 0.12)";
          btn.style.color = "#94a3b8";
        } else {
          btn.style.background = "linear-gradient(135deg, #38bdf8, #818cf8)";
          btn.style.color = "#fff";
        }
        btn.addEventListener("click", () => { try { overlay.remove(); } catch (e) {} resolve(op.id); });
        actions.appendChild(btn);
      }
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { try { overlay.remove(); } catch (e2) {} resolve(null); } });
    });
  }

  /**
   * Diálogo para elegir un requerimiento al que mover el archivo.
   * Devuelve el nombre del requerimiento elegido o null si cancela.
   */
  function elegirRequerimiento(nombreArchivo) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "mau-confirm";
      const box = document.createElement("div");
      box.className = "mau-confirm-box";
      const h = document.createElement("div");
      h.style.fontWeight = "700";
      h.style.fontSize = "16px";
      h.style.marginBottom = "8px";
      h.textContent = "Elegí el requerimiento";
      const p = document.createElement("div");
      p.style.fontSize = "13px";
      p.style.color = "#94a3b8";
      p.style.marginBottom = "10px";
      p.textContent = nombreArchivo ? `Archivo: ${nombreArchivo}` : "";
      const sel = document.createElement("select");
      sel.className = "mau-select";
      sel.style.marginBottom = "12px";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Seleccionar requerimiento…";
      sel.appendChild(empty);
      // Lista: todos los requerimientos, marcando los que ya tienen archivo.
      for (const req of estado.requerimientos) {
        const ocupado = estado.filas.some(
          (f) => f.tipo === "requerimiento" && f.requerimiento === req.nombre && f.archivo
        );
        const recursoLabel = etiquetaRecurso(req.recurso);
        const op = document.createElement("option");
        op.value = req.nombre + "||" + (req.recurso?.apellido || "");
        const base = recursoLabel ? `${req.nombre} ← ${recursoLabel}` : req.nombre;
        op.textContent = ocupado ? `${base}  (ya tiene archivo)` : base;
        op.dataset.nombre = req.nombre;
        sel.appendChild(op);
      }
      const actions = document.createElement("div");
      actions.className = "mau-confirm-actions";
      const btnOk = document.createElement("button");
      btnOk.type = "button";
      btnOk.textContent = "Mover archivo";
      const btnCancel = document.createElement("button");
      btnCancel.type = "button";
      btnCancel.textContent = "Cancelar";
      actions.appendChild(btnOk);
      actions.appendChild(btnCancel);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(sel);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const cerrar = (val) => { try { overlay.remove(); } catch (e) {} resolve(val); };
      btnOk.addEventListener("click", () => {
        if (!sel.value) { mostrarToast("Elegí un requerimiento primero."); return; }
        const opt = sel.options[sel.selectedIndex];
        cerrar(opt?.dataset?.nombre || null);
      });
      btnCancel.addEventListener("click", () => cerrar(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(null); });
    });
  }

  function construirFirma(bloques, textosPorPagina) {
    return bloques.map((b) => {
      const row = textosPorPagina.find((x) => x.pagina === b.desde);
      const raw = row?.texto || "";
      return window.MAUStorage.normalizar(raw).slice(0, 50);
    });
  }

  function similitudFirmas(f1, f2) {
    if (!f1?.length || f1.length !== f2.length) return 0;
    let s = 0;
    for (let i = 0; i < f1.length; i++) {
      const a = f1[i];
      const b = f2[i];
      const sim = window.MAUMatcher.similitudSimple(a, b);
      const pref = 12;
      const pa = a.slice(0, pref);
      const pb = b.slice(0, pref);
      const overlap = pa.length && pb.length && (a.includes(pb) || b.includes(pa));
      s += Math.max(sim, overlap ? 0.65 : 0);
    }
    return s / f1.length;
  }

  function buscarPatronSimilar(firmaNueva, patrones, umbral = 0.55) {
    let mejor = null;
    let mejorScore = 0;
    for (const p of patrones || []) {
      if (!p.firma || p.firma.length !== firmaNueva.length) continue;
      const sc = similitudFirmas(firmaNueva, p.firma);
      if (sc > mejorScore) {
        mejorScore = sc;
        mejor = p;
      }
    }
    if (mejor && mejorScore >= umbral) return { ...mejor, score: mejorScore };
    return null;
  }

  /**
   * Incorpora archivos resultantes del split de sábana.
   * @param {Array<File>} files - Archivos PDF resultantes del split.
   * @param {Array<Object>} [bloquesMetadata] - Opcional: metadata OCR de cada bloque
   *        (en el mismo orden que files), con {apellido, nombre, cuil, patente, periodo}.
   */
  async function incorporarArchivosPostSplit(files, bloquesMetadata) {
    const memoria = await window.MAUStorage.leerMemoria();
    const reqObjs = estado.requerimientos.map((r) => ({ nombre: r.nombre, recurso: r.recurso || null }));
    for (let i = 0; i < files.length; i++) {
      const archivo = files[i];
      const meta = bloquesMetadata && bloquesMetadata[i] ? bloquesMetadata[i] : null;
      const sugerido = window.MAUMatcher.sugerirRequerimiento(archivo.name, reqObjs, memoria, meta);
      if (sugerido) {
        // Pasar metadata para que la asignación elija la fila correcta por recurso.
        asignarArchivoARequerimiento(sugerido, archivo, meta);
      } else {
        agregarFilaSinAsignar(archivo);
      }
    }
    renderTabla();
  }

  function renderTablaEditorSabana(bloques) {
    if (!ui.sabanaTablaBody) return;
    ui.sabanaTablaBody.innerHTML = "";
    for (const b of bloques) {
      const tr = document.createElement("tr");
      const tdN = document.createElement("td");
      const tdD = document.createElement("td");
      const tdH = document.createElement("td");
      const inN = document.createElement("input");
      inN.type = "text";
      inN.className = "mau-input mau-sab-nombre";
      inN.value = b.nombre || "Bloque";
      const inD = document.createElement("input");
      inD.type = "number";
      inD.className = "mau-input mau-sab-desde";
      inD.min = "1";
      inD.value = String(b.desde);
      const inH = document.createElement("input");
      inH.type = "number";
      inH.className = "mau-input mau-sab-hasta";
      inH.min = "1";
      inH.value = String(b.hasta);
      tdN.appendChild(inN);
      tdD.appendChild(inD);
      tdH.appendChild(inH);
      tr.appendChild(tdN);
      tr.appendChild(tdD);
      tr.appendChild(tdH);
      ui.sabanaTablaBody.appendChild(tr);
    }
  }

  function leerBloquesDesdeEditor() {
    const filas = ui.sabanaTablaBody?.querySelectorAll("tr") || [];
    const bloques = [];
    filas.forEach((tr) => {
      const nombre = tr.querySelector(".mau-sab-nombre")?.value?.trim() || "Bloque";
      const desde = parseInt(tr.querySelector(".mau-sab-desde")?.value, 10);
      const hasta = parseInt(tr.querySelector(".mau-sab-hasta")?.value, 10);
      if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde < 1 || hasta < desde) {
        throw new Error("Rangos desde/hasta inválidos en la tabla de bloques.");
      }
      bloques.push({ nombre, desde, hasta });
    });
    return bloques;
  }

  function resetSabanaUi() {
    estado.sabanaPendiente = null;
    estado.sabanaContexto = null;
    if (ui.sabanaWrap) ui.sabanaWrap.hidden = true;
    if (ui.sabanaEditor) ui.sabanaEditor.hidden = true;
    if (ui.patronNombre) ui.patronNombre.value = "";
    if (ui.sabanaTablaBody) ui.sabanaTablaBody.innerHTML = "";
    actualizarProgreso(0, 0, "Sin procesamiento en curso");
  }

  function cancelarEditorSabana() {
    if (ui.sabanaEditor) ui.sabanaEditor.hidden = true;
    estado.sabanaContexto = null;
    ui.pText.textContent = "Sin procesamiento en curso";
  }

  async function ejecutarFlujoOcrSabana() {
    const file = estado.sabanaPendiente;
    if (!file) {
      console.warn("[MAU] No hay PDF pendiente para OCR.");
      return;
    }
    // Preguntar antes de dividir: ¿son varios docs o es uno solo?
    const dividir = await preguntarSiNo({
      titulo: "¿Este PDF tiene varios documentos?",
      mensaje:
        `"${file.name}" — Si es un solo documento, la IA igual lo lee ` +
        `para identificarlo (apellido, CUIL, tipo), pero no lo divide en partes.`,
      labelSi: "Sí, dividir en varios",
      labelNo: "No, es un solo documento"
    });
    if (!dividir) {
      await tratarComoDocumentoUnico(file);
      resetSabanaUi();
      return;
    }
    const btn = ui.ocrDividir;
    if (btn) btn.disabled = true;
    try {
      if (!estado.requerimientos.length) await detectarRequerimientosPendientes();
      const patrones = await window.MAUStorage.leerPatronesSabana();
      ui.pText.textContent = "Cargando OCR…";

      const textos = await window.MAUOcrEngine.extraerTextoPorPagina(file, (info) => {
        if (info.pagina != null && info.totalPaginas != null) {
          const pct = Math.round((info.pagina / info.totalPaginas) * 100);
          actualizarProgreso(info.pagina, info.totalPaginas, info.mensaje || `OCR página ${info.pagina} de ${info.totalPaginas}`);
          ui.pInner.style.width = `${pct}%`;
        } else if (info.mensaje) {
          ui.pText.textContent = info.mensaje;
        }
      });

      const bloques = window.MAUPdfSplitter.detectarBloques(textos, null);
      const firma = construirFirma(bloques, textos);
      const match = buscarPatronSimilar(firma, patrones, 0.55);

      const muchasPaginas = textos.length > 8;
      const pocosBloques = bloques.length < 2;
      const requiereRevisionUsuario = pocosBloques && muchasPaginas;

      if (match && !requiereRevisionUsuario) {
        console.log("[MAU] Patrón automático:", match.nombre, "score", match.score);
        mostrarToast(`Patrón «${match.nombre}» aplicado automáticamente`);
        const files = await window.MAUPdfSplitter.dividirPdfPorRangos(file, match.bloques);
        // Extraer metadata OCR de cada bloque para matchear contra Recurso.
        const bloquesMetadata = (match.bloques || bloques || []).map((b) => ({
          apellido: b.apellido || "",
          nombre: b.nombreEmp || b.nombre || "",
          cuil: b.cuil || "",
          patente: b.patente || "",
          periodo: b.periodo || ""
        }));
        await incorporarArchivosPostSplit(files, bloquesMetadata);
        resetSabanaUi();
        return;
      }

      estado.sabanaContexto = { file, textosPorPagina: textos, bloques, firma };
      renderTablaEditorSabana(bloques);
      if (ui.patronNombre) {
        ui.patronNombre.value = requiereRevisionUsuario && match?.nombre ? match.nombre : "";
      }
      if (ui.sabanaEditor) ui.sabanaEditor.hidden = false;
      if (requiereRevisionUsuario && match) {
        mostrarToast("Pocos bloques detectados: revisá rangos y confirmá el patrón.");
      }
      ui.pText.textContent = "Revisá bloques y nombre del patrón, luego confirmá.";
    } catch (e) {
      alertarErrorOcr(e);
      ui.pText.textContent = `Error: ${e.message || e}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function confirmarPatronSabana() {
    const ctx = estado.sabanaContexto;
    if (!ctx?.file) return;
    const nombrePatron = ui.patronNombre?.value?.trim();
    if (!nombrePatron) {
      ui.pText.textContent = "Escribí un nombre de patrón (ej. Lista A).";
      return;
    }
    try {
      const bloques = leerBloquesDesdeEditor();
      const firma = construirFirma(bloques, ctx.textosPorPagina);
      await window.MAUStorage.guardarPatronSabana({ nombre: nombrePatron, bloques, firma });
      const files = await window.MAUPdfSplitter.dividirPdfPorRangos(ctx.file, bloques);
      // Pasar metadata OCR de los bloques originales del contexto.
      const bloquesOCR = ctx.bloques || [];
      const bloquesMetadata = bloques.map((b, i) => {
        const ocrBloque = bloquesOCR[i] || {};
        return {
          apellido: ocrBloque.apellido || "",
          nombre: ocrBloque.nombreEmp || ocrBloque.nombre || "",
          cuil: ocrBloque.cuil || "",
          patente: ocrBloque.patente || "",
          periodo: ocrBloque.periodo || ""
        };
      });
      await incorporarArchivosPostSplit(files, bloquesMetadata);
      mostrarToast(`Patrón «${nombrePatron}» guardado y archivos generados.`);
      resetSabanaUi();
    } catch (e) {
      console.error(e);
      ui.pText.textContent = e.message || String(e);
    }
  }

  /**
   * Asigna un archivo a un requerimiento. Si hay metadata, elige la fila cuyo Recurso
   * coincida (para no poner el recibo de FERNANDEZ en la fila de GONZALEZ).
   * Si no hay metadata o no hay match por recurso, asigna a la primera fila disponible sin archivo.
   *
   * @param {string} nombreReq - Nombre del requerimiento.
   * @param {File} archivo - Archivo PDF a asignar.
   * @param {Object} [metadata] - Metadata OCR: { apellido, nombre, cuil, patente }.
   */
  function asignarArchivoARequerimiento(nombreReq, archivo, metadata) {
    // Soporta clave compuesta "nombre||apellido" generada por el modal cuando hay duplicados.
    let apellidoForzado = null;
    if (nombreReq.includes("||")) {
      const partes = nombreReq.split("||");
      nombreReq = partes[0];
      apellidoForzado = partes[1];
    }
    if (apellidoForzado) {
      metadata = Object.assign({}, metadata || {}, { apellido: apellidoForzado });
    }

    console.log(`[MAU][ASIGNAR] === Inicio asignación ===`);
    console.log(`[MAU][ASIGNAR] Archivo: "${archivo.name}" → Requerimiento buscado: "${nombreReq}"`);
    console.log(`[MAU][ASIGNAR] Metadata:`, JSON.stringify(metadata || null));
    console.log(`[MAU][ASIGNAR] Total filas en estado: ${estado.filas.length}`);

    let filasCoincidentes = estado.filas.filter(
      (f) => f.tipo === "requerimiento" && f.requerimiento === nombreReq
    );

    // Fallback: si no coincide exacto, buscar ignorando el sufijo de período (-2026-3, -2026-2, etc.)
    if (filasCoincidentes.length === 0) {
      const quitarPeriodo = (s) => (s || "").replace(/-\d{4}-\d+.*$/i, "").trim();
      const baseNombreReq = quitarPeriodo(nombreReq);
      // LOG DEBUG: mostrar TODAS las filas que contienen el base del requerimiento
      const todasConBase = estado.filas.filter((f) => f.tipo === "requerimiento" && quitarPeriodo(f.requerimiento) === baseNombreReq);
      console.log(`[MAU][DEBUG] Filas con base "${baseNombreReq}": ${todasConBase.length}`);
      todasConBase.forEach((f, i) => console.log(`[MAU][DEBUG]   [${i}] req="${f.requerimiento}" recurso="${f.recurso?.apellido || '(vacío)'}" id=${f.id}`));
      let candidatosFallback = estado.filas.filter(
        (f) => f.tipo === "requerimiento" && quitarPeriodo(f.requerimiento) === baseNombreReq
      );
      // Si tenemos apellido forzado (o en metadata), preferir filas que tienen recurso con persona.
      // Así evitamos caer en filas genéricas sin persona (recurso vacío).
      const apellidoBusqueda = (apellidoForzado || metadata?.apellido || "").toLowerCase();
      if (apellidoBusqueda && candidatosFallback.length > 1) {
        const conRecurso = candidatosFallback.filter((f) => f.recurso?.apellido);
        if (conRecurso.length > 0) candidatosFallback = conRecurso;
      }
      // Si hay filas con recurso pero ninguna coincide con el apellido, igualmente preferirlas
      // sobre filas sin recurso (genéricas).
      if (!apellidoBusqueda) {
        const sinRecurso = candidatosFallback.filter((f) => !f.recurso?.apellido);
        const conRecurso = candidatosFallback.filter((f) => f.recurso?.apellido);
        if (conRecurso.length > 0) candidatosFallback = conRecurso;
        else candidatosFallback = sinRecurso;
      }
      filasCoincidentes = candidatosFallback;
      if (filasCoincidentes.length > 0) {
        console.log(`[MAU][ASIGNAR] Match por nombre base (sin período): "${baseNombreReq}" → ${filasCoincidentes.length} fila(s) (con recurso preferidas)`);
      }
    }

    console.log(`[MAU][ASIGNAR] Filas coincidentes con "${nombreReq}": ${filasCoincidentes.length}`);
    filasCoincidentes.forEach((f, i) => {
      console.log(`[MAU][ASIGNAR]   [${i}] id=${f.id}, recurso=${f.recurso?.apellido || '(vacío)'}, yaArchivo=${!!f.archivo}`);
    });

    if (filasCoincidentes.length === 0) {
      console.log(`[MAU][ASIGNAR] ⚠ Sin coincidencias, saliendo sin asignar.`);
      return;
    }

    let filaDestino = null;

    if (filasCoincidentes.length === 1) {
      // Única fila con este nombre → asignar directo.
      filaDestino = filasCoincidentes[0];
      console.log(`[MAU][ASIGNAR] Única fila → id=${filaDestino.id}`);
    } else if (metadata && (metadata.apellido || metadata.cuil)) {
      // Múltiples filas con mismo nombre → usar metadata para elegir la correcta.
      // Construir nombre completo: apellido + nombre (ej: "FERNANDEZ DIEGO ARIEL")
      // para distinguir entre "FERNANDEZ ENRIQUE DARIO" y "FERNANDEZ DIEGO ARIEL".
      const metaNombreCompleto = [metadata.apellido, metadata.nombre].filter(Boolean).join(" ").toLowerCase();
      const metaApellido = metaNombreCompleto || (metadata.apellido || "").toLowerCase();
      const metaCuil = (metadata.cuil || "").replace(/\D/g, "");
      console.log(`[MAU][ASIGNAR] Buscando por metadata: nombre="${metaApellido}", cuil="${metaCuil}"`);
      for (const f of filasCoincidentes) {
        if (!f.recurso) continue;
        const recApellido = (f.recurso.apellido || "").toLowerCase();
        const recCuil = (f.recurso.cuil || "").replace(/\D/g, "");
        // 1) Match por CUIL exacto → máxima prioridad, cortar búsqueda
        if (metaCuil && recCuil && metaCuil === recCuil) {
          filaDestino = f;
          console.log(`[MAU][ASIGNAR] Match CUIL exacto → id=${f.id}`);
          break;
        }
        // 2) Match por nombre completo → preferir fila vacía sobre fila con archivo
        if (metaApellido && recApellido && (recApellido.includes(metaApellido) || metaApellido.includes(recApellido))) {
          const esMejorQueActual = !filaDestino || (f.archivo == null && filaDestino.archivo != null);
          if (esMejorQueActual) {
            filaDestino = f;
            console.log(`[MAU][ASIGNAR] Match apellido → id=${f.id} vacía=${!f.archivo} (sigue buscando CUIL)`);
          }
        }
      }
      // 3) Sin match por recurso → primera fila vacía, o cualquiera como último recurso
      if (!filaDestino) {
        filaDestino = filasCoincidentes.find((f) => !f.archivo) || filasCoincidentes[0];
        console.log(`[MAU][ASIGNAR] Sin match recurso, fallback vacía → id=${filaDestino.id}`);
      }
    } else {
      // Sin metadata → asignar a la primera fila SIN archivo ya asignado.
      filaDestino = filasCoincidentes.find((f) => !f.archivo) || filasCoincidentes[0];
      console.log(`[MAU][ASIGNAR] Sin metadata, primera sin archivo → id=${filaDestino.id}`);
    }

    if (filaDestino) {
      filaDestino.archivo = new File([archivo], archivo.name, { type: archivo.type || "application/pdf" });
      if (filaDestino.estado === "sin-asignar") filaDestino.estado = "pendiente";
      estado.ultFilaNuevaId = filaDestino.id;
      console.log(`[MAU][ASIGNAR] ✓ ASIGNADO: fila id=${filaDestino.id}, req="${filaDestino.requerimiento}", archivo="${archivo.name}"`);
    } else {
      console.log(`[MAU][ASIGNAR] ✗ NO se asignó a ninguna fila.`);
    }

    // Patente: buscar requerimientos de automotor/técnico.
    const patente = (archivo.name || "").match(/\b[a-z]{2,3}\d{3}\b/i)?.[0] ||
                    (metadata?.patente || "");
    if (patente) {
      const normPat = patente.toLowerCase();
      const auto = estado.filas.find((f) =>
        !f.archivo && window.MAUStorage.normalizar(f.requerimiento).includes(`automotor patente ${normPat}`)
      );
      const tec = estado.filas.find((f) =>
        !f.archivo && window.MAUStorage.normalizar(f.requerimiento).includes(`tecnico patente ${normPat}`)
      );
      if (auto) {
        auto.archivo = new File([archivo], archivo.name, { type: archivo.type || "application/pdf" });
        auto.estado = "pendiente";
      }
      if (tec) {
        tec.archivo = new File([archivo], archivo.name, { type: archivo.type || "application/pdf" });
        tec.estado = "pendiente";
      }
    }
  }

  function agregarFilaSinAsignar(archivo) {
    const nuevaFila = {
      id: estado.nextFilaId++,
      tipo: "sin-asignar",
      requerimiento: null,
      archivo,
      estado: "sin-asignar"
    };
    estado.filas.push(nuevaFila);
    estado.ultFilaNuevaId = nuevaFila.id;
  }

  /**
   * Genera un texto corto descriptivo del recurso para mostrar en la UI.
   */
  function etiquetaRecurso(recurso) {
    if (!recurso || (!recurso.apellido && !recurso.textoCompleto)) return "";
    if (recurso.apellido || recurso.nombre) {
      const partes = [recurso.apellido, recurso.nombre].filter(Boolean).join(" ");
      return partes;
    }
    // Fallback: primera línea del texto completo.
    return (recurso.textoCompleto || "").split(/\n/)[0].trim().slice(0, 40);
  }

  function renderTabla() {
    ui.tabla.innerHTML = "";
    for (const f of estado.filas) {
      const tr = document.createElement("tr");
      tr.dataset.filaId = String(f.id);
      const tdReq = document.createElement("td");
      const tdArchivo = document.createElement("td");
      const tdEstado = document.createElement("td");

      if (f.estado === "sin-asignar") {
        const select = document.createElement("select");
        select.className = "mau-select";
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "Seleccionar requerimiento...";
        select.appendChild(emptyOpt);
        for (const req of estado.requerimientos) {
          const op = document.createElement("option");
          op.value = req.nombre;
          // Mostrar recurso junto al nombre del requerimiento en el dropdown.
          const recursoLabel = etiquetaRecurso(req.recurso);
          op.textContent = recursoLabel ? `${req.nombre}  ← ${recursoLabel}` : req.nombre;
          select.appendChild(op);
        }
        select.addEventListener("change", async () => {
          if (!select.value || !f.archivo) return;
          await asignacionManualDesdeSinAsignar(f.id, select.value);
        });
        tdReq.appendChild(select);
      } else {
        // Mostrar nombre del requerimiento + recurso abajo en gris.
        const spanReq = document.createElement("div");
        spanReq.textContent = f.requerimiento || "-";
        // Botón "ver" — resalta el requerimiento en la página para leerlo bien.
        const btnVer = document.createElement("button");
        btnVer.type = "button";
        btnVer.className = "mau-row-btn";
        btnVer.textContent = "👁 Ver";
        btnVer.title = "Ver este requerimiento en la página";
        btnVer.addEventListener("click", (ev) => {
          ev.stopPropagation();
          verRequerimientoEnPagina(f);
        });
        spanReq.appendChild(btnVer);
        tdReq.appendChild(spanReq);
        const recursoLabel = etiquetaRecurso(f.recurso);
        if (recursoLabel) {
          const spanRec = document.createElement("div");
          spanRec.style.fontSize = "12px";
          spanRec.style.color = "#94a3b8";
          spanRec.style.marginTop = "3px";
          spanRec.textContent = `↳ ${recursoLabel}`;
          tdReq.appendChild(spanRec);
        }
      }

      // Celda "Archivo asignado": nombre + botón eliminar si hay archivo.
      const archivoWrap = document.createElement("div");
      archivoWrap.className = "mau-archivo-cell";
      const archivoNombre = document.createElement("span");
      archivoNombre.className = "mau-archivo-nombre";
      archivoNombre.textContent = f.archivo ? f.archivo.name : "-";
      if (f.archivo && f.archivo.name) archivoNombre.title = f.archivo.name;
      archivoWrap.appendChild(archivoNombre);
      if (f.archivo && f.estado !== "procesando" && f.estado !== "enviado") {
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "mau-row-btn mau-row-btn-danger";
        btnDel.textContent = "🗑";
        btnDel.title = "Quitar este archivo";
        btnDel.addEventListener("click", (ev) => {
          ev.stopPropagation();
          eliminarArchivoDeFila(f.id);
        });
        archivoWrap.appendChild(btnDel);
      }
      tdArchivo.appendChild(archivoWrap);
      const detalleError = f.errorMensaje ? ` title="${escapeHtml(f.errorMensaje)}"` : "";
      tdEstado.innerHTML = `<span class="mau-badge mau-${f.estado}"${detalleError}>${f.estado}</span>`;
      if (f.errorMensaje) {
        const detalle = document.createElement("div");
        detalle.style.fontSize = "11px";
        detalle.style.color = "#8a1d1d";
        detalle.textContent = f.errorMensaje;
        tdEstado.appendChild(detalle);
      }
      tr.appendChild(tdReq);
      tr.appendChild(tdArchivo);
      tr.appendChild(tdEstado);
      ui.tabla.appendChild(tr);
    }

    if (estado.ultFilaNuevaId != null) {
      const filaNueva = ui.tabla.querySelector(`tr[data-fila-id="${estado.ultFilaNuevaId}"]`);
      if (filaNueva) {
        filaNueva.scrollIntoView({ behavior: "smooth", block: "nearest" });
        filaNueva.classList.add("mau-row-flash");
        setTimeout(() => filaNueva.classList.remove("mau-row-flash"), 1000);
      }
      estado.ultFilaNuevaId = null;
    }
  }

  async function asignacionManualDesdeSinAsignar(filaId, nombreRequerimiento) {
    const filaSinAsignar = estado.filas.find((f) => f.id === filaId && f.estado === "sin-asignar");
    if (!filaSinAsignar || !filaSinAsignar.archivo) return;
    asignarArchivoARequerimiento(nombreRequerimiento, filaSinAsignar.archivo);
    await window.MAUStorage.aprenderPatron(filaSinAsignar.archivo.name, nombreRequerimiento);
    estado.filas = estado.filas.filter((f) => f.id !== filaId);
    renderTabla();
    console.log("[MAU] Asignación manual guardada en memoria:", filaSinAsignar.archivo.name, "=>", nombreRequerimiento);
  }

  /**
   * Usado cuando el usuario confirma que un PDF de varias páginas es un
   * solo documento: NO se divide, pero SÍ se lee con IA la primera página
   * para identificar apellido/CUIL/tipo y asignarlo al requerimiento correcto.
   */
  async function tratarComoDocumentoUnico(archivo) {
    try {
      if (!estado.requerimientos.length) await detectarRequerimientosPendientes();
      const memoria = (await window.MAUStorage.leerMemoria()) || {};

      // Leer contenido del PDF con IA (solo primera página) para extraer datos.
      let metaOcr = null;
      try {
        if (window.MAUOcrEngine?.extraerTextoPorPagina) {
          ui.pText.textContent = `Leyendo ${archivo.name} con IA (1 página)…`;
          console.log("[MAU] OCR: analizando primera página del PDF 'documento único':", archivo.name);
          // Solo 1 página: ahorro de API.
          const textos = await window.MAUOcrEngine.extraerTextoPorPagina(archivo, () => {}, { maxPaginas: 1 });
          if (textos.length > 0) {
            const t = textos[0];
            metaOcr = {
              id: t.id || "",
              etiqueta: t.etiqueta || "",
              apellido: t.apellido || "",
              nombre: t.nombre || "",
              cuil: t.cuil || "",
              patente: t.patente || "",
              periodo: t.periodo || ""
            };
            console.log("[MAU] OCR resultado (doc único):", JSON.stringify(metaOcr));
            const etiq = metaOcr.etiqueta || metaOcr.id || "documento";
            const pers = metaOcr.apellido ? ` — ${metaOcr.apellido} ${metaOcr.nombre || ""}` : "";
            mostrarToast(`IA detectó: ${etiq}${pers}`);
          }
          ui.pText.textContent = "Sin procesamiento en curso";
        }
      } catch (ocrErr) {
        console.warn("[MAU] Error OCR en documento único:", ocrErr);
        ui.pText.textContent = "Sin procesamiento en curso";
      }

      const reqObjs = estado.requerimientos.map((r) => ({ nombre: r.nombre, recurso: r.recurso || null }));
      const sugerido = window.MAUMatcher.sugerirRequerimiento(archivo.name, reqObjs, memoria, metaOcr);
      if (sugerido) {
        asignarArchivoARequerimiento(sugerido, archivo, metaOcr);
        mostrarToast(`Asignado a "${sugerido}" (sin dividir).`);
      } else {
        agregarFilaSinAsignar(archivo);
        mostrarToast("Archivo agregado sin dividir. Elegí el requerimiento en la tabla.");
      }
      renderTabla();
    } catch (e) {
      console.error("[MAU] Error al tratar PDF como documento único:", e);
      mostrarToast("No se pudo agregar el archivo. Revisá la consola.");
    }
  }

  /**
   * PDF tratado como documento único, asignado manualmente por el usuario:
   * NO consume API. El archivo entra a la tabla como "sin asignar" y el
   * usuario elige el requerimiento desde el dropdown.
   */
  function asignarDocumentoUnicoManual(archivo) {
    try {
      agregarFilaSinAsignar(archivo);
      renderTabla();
      mostrarToast("Archivo agregado. Elegí el requerimiento en la tabla.");
    } catch (e) {
      console.error("[MAU] Error en asignación manual:", e);
      mostrarToast("No se pudo agregar el archivo.");
    }
  }

  async function eliminarArchivoDeFila(filaId) {
    const fila = estado.filas.find((f) => f.id === filaId);
    if (!fila) return;
    const nombreArchivo = fila.archivo?.name || "";
    const opcion = await preguntarOpciones({
      titulo: "¿Qué querés hacer con este archivo?",
      mensaje: nombreArchivo ? `Archivo: ${nombreArchivo}` : "",
      opciones: [
        { id: "mover", label: "📁 Asignar a otro requerimiento" },
        { id: "olvidar", label: "🗑 Eliminar (y olvidar de la memoria)", danger: true },
        { id: "cancel", label: "Cancelar", secondary: true }
      ]
    });
    if (opcion === "mover") {
      await reasignarArchivoAOtroRequerimiento(filaId);
      return;
    }
    if (opcion === "olvidar") {
      await quitarYOlvidarArchivo(filaId);
      return;
    }
    // cancel o click fuera: no hago nada
  }

  async function reasignarArchivoAOtroRequerimiento(filaId) {
    const fila = estado.filas.find((f) => f.id === filaId);
    if (!fila || !fila.archivo) return;
    const archivo = fila.archivo;
    const nombreNuevoReq = await elegirRequerimiento(archivo.name);
    if (!nombreNuevoReq) return;
    // Limpiar la fila actual.
    if (fila.tipo === "sin-asignar") {
      estado.filas = estado.filas.filter((f) => f.id !== filaId);
    } else {
      fila.archivo = null;
      fila.estado = "pendiente";
      fila.errorMensaje = "";
    }
    // Asignar al nuevo requerimiento (usa el matcher interno por nombre y recurso).
    asignarArchivoARequerimiento(nombreNuevoReq, archivo, null);
    // Actualizar la memoria para que la próxima vez este archivo se asigne ahí.
    try {
      await window.MAUStorage.aprenderPatron(archivo.name, nombreNuevoReq);
    } catch (e) { console.warn("[MAU] No se pudo actualizar memoria:", e); }
    renderTabla();
    mostrarToast(`Movido a "${nombreNuevoReq}".`);
  }

  async function quitarYOlvidarArchivo(filaId) {
    const fila = estado.filas.find((f) => f.id === filaId);
    if (!fila) return;
    const nombreArchivo = fila.archivo?.name || "";
    // Quitar archivo de la fila (o eliminar fila si era "sin-asignar").
    if (fila.tipo === "sin-asignar") {
      estado.filas = estado.filas.filter((f) => f.id !== filaId);
    } else {
      fila.archivo = null;
      fila.estado = "pendiente";
      fila.errorMensaje = "";
    }
    // Olvidar el patrón aprendido para ese nombre de archivo: la próxima vez
    // que se suba, NO se asigna automáticamente.
    if (nombreArchivo) {
      try {
        const memoria = (await window.MAUStorage.leerMemoria()) || {};
        const claveNorm = window.MAUStorage.normalizar(nombreArchivo);
        let borradas = 0;
        if (Object.prototype.hasOwnProperty.call(memoria, claveNorm)) {
          delete memoria[claveNorm];
          borradas++;
        }
        // También borrar coincidencias parciales (por si el nombre varía un poco).
        for (const k of Object.keys(memoria)) {
          if (k !== claveNorm && (k.includes(claveNorm) || claveNorm.includes(k))) {
            delete memoria[k];
            borradas++;
          }
        }
        if (borradas > 0) {
          await window.MAUStorage.guardarMemoria(memoria);
        }
        console.log(`[MAU] Memoria limpiada: ${borradas} patrón(es) borrados para "${nombreArchivo}".`);
      } catch (e) { console.warn("[MAU] No se pudo olvidar patrón:", e); }
    }
    renderTabla();
    mostrarToast(nombreArchivo ? `Eliminado y olvidado: ${nombreArchivo}` : "Archivo eliminado");
  }

  function verRequerimientoEnPagina(fila) {
    if (!fila || !fila.requerimiento) return;
    // Buscar el link original del requerimiento en estado.requerimientos.
    const apellido = (fila.recurso?.apellido || "").toLowerCase();
    let req = estado.requerimientos.find((r) =>
      r.nombre === fila.requerimiento &&
      (apellido ? (r.recurso?.apellido || "").toLowerCase() === apellido : true)
    );
    if (!req) req = estado.requerimientos.find((r) => r.nombre === fila.requerimiento);
    const link = req?.link;
    if (!link || !link.isConnected) {
      mostrarToast("No se pudo ubicar el requerimiento en la página. Refrescá la lista.");
      return;
    }
    const tr = link.closest("tr");
    const destino = tr || link;
    try { destino.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    // Resaltar visualmente la fila original por unos segundos.
    if (tr) {
      const estiloPrevio = tr.style.cssText;
      tr.style.transition = "background-color 0.3s ease, box-shadow 0.3s ease";
      tr.style.backgroundColor = "rgba(56, 189, 248, 0.25)";
      tr.style.boxShadow = "inset 0 0 0 2px #38bdf8";
      setTimeout(() => { tr.style.cssText = estiloPrevio; }, 3500);
    }
    mostrarToast("Mirá la fila resaltada en la página para leer el detalle.");
  }

  async function expandirTablaCompleta() {
    try {
      const selectMostrar = document.querySelector("select[name='tblRequerimientos_length']");
      if (!selectMostrar) {
        console.warn("[MAU] No se encontró el select 'Mostrar X requerimientos'.");
        return;
      }
      if (selectMostrar.value === "-1") {
        console.log("[MAU] Tabla ya mostrando todos los registros.");
        return;
      }
      console.log("[MAU] Expandiendo tabla a TODOS los registros antes de procesar...");
      selectMostrar.value = "-1";
      selectMostrar.dispatchEvent(new Event("change", { bubbles: true }));
      await dormir(2500);
      console.log("[MAU] Tabla expandida a todos los registros.");
    } catch (e) {
      console.warn("[MAU] Error al expandir tabla:", e);
    }
  }

  async function procesarTodo() {
    const items = estado.filas.filter((f) => f.archivo && f.requerimiento && f.estado !== "sin-asignar");
    console.log(`[MAU][PROCESAR] ======= INICIO procesarTodo =======`);
    console.log(`[MAU][PROCESAR] Items a procesar: ${items.length} de ${estado.filas.length} filas totales`);
    items.forEach((item, i) => {
      console.log(`[MAU][PROCESAR]   [${i}] req="${item.requerimiento}" | archivo="${item.archivo?.name}" | recurso="${item.recurso?.apellido || '(vacío)'}"`);
    });
    // Detectar si hay archivos duplicados
    const archivosUsados = items.map(i => i.archivo?.name).filter(Boolean);
    const duplicados = archivosUsados.filter((n, i) => archivosUsados.indexOf(n) !== i);
    if (duplicados.length) {
      console.warn(`[MAU][PROCESAR] ⚠⚠⚠ ARCHIVOS DUPLICADOS DETECTADOS: ${[...new Set(duplicados)].join(', ')}`);
    }

    // Expandir tabla para asegurarse de que todos los requerimientos estén en el DOM
    await expandirTablaCompleta();

    let ok = 0, err = 0, skip = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      item.errorMensaje = "";
      item.estado = "procesando";
      actualizarProgreso(i + 1, items.length, `Procesando ${i + 1} de ${items.length}...`);
      renderTabla();

      try {
        const inicioFilaTs = Date.now();
        const reqObj = await ejecutarPaso(item, "buscar requerimiento", async () => {
          // Re-buscar el link en el DOM vivo (los anteriores quedan stale después de cada Volver/recarga).
          // Pasar recurso para desambiguar filas con mismo nombre pero distinto empleado.
          const linkVivo = buscarLinkRequerimientoVivo(item.requerimiento, item.recurso);
          if (linkVivo) return { nombre: item.requerimiento, link: linkVivo, recurso: item.recurso };
          const encontrado = estado.requerimientos.find((r) => r.nombre === item.requerimiento);
          if (!encontrado || !encontrado.link) throw new Error("No se encontró el requerimiento en la página. Verificá que la tabla esté cargada y el filtro incluya este requerimiento.");
          return encontrado;
        });
        await ejecutarPaso(item, "abrir requerimiento", async () => reqObj.link.click());

        await ejecutarPaso(item, "esperar iframe principal", async () => esperarIframe());
        await ejecutarPaso(item, "click en Adjuntar archivo", async () => clickAdjuntar());
        await ejecutarPaso(item, "esperar iframe secundario", async () => esperarSegundoIframe());
        await ejecutarPaso(item, "inyectar archivo", async () => inyectarArchivo(item.archivo));
        const resultadoCarga = await ejecutarPaso(item, "esperar confirmación de carga", async () =>
          esperarConfirmacionCargaEnIframes(60000)
        );

        console.log("[MAU] Resultado de confirmación de carga:", resultadoCarga);
        if (resultadoCarga === "primus-lens") {
          console.log("[MAU] Paso Primus Lens: click en Continuar del aviso.");
          await ejecutarPaso(item, "click en Continuar de Primus Lens", async () => clickEnIframes("Continuar"));
          await ejecutarPaso(item, "esperar cierre del modal Primus Lens", async () => esperarCierreAvisoPrimusLens(8000));
          await dormir(1500);
        } else {
          console.log("[MAU] Carga detectada por mensaje de éxito.");
        }
        // Espera de seguridad de 60s DESPUÉS de Primus Lens, antes de verificar y apretar Enviar.
        await esperarConCountdown(10000, (segRest) => {
          ui.pText.textContent = `Esperando que ${item.requerimiento} termine de cargar… (${segRest}s)`;
        });
        await ejecutarPaso(item, "verificar archivo adjuntado", async () =>
          verificarAdjuntoEnFancyboxPrincipal(item.archivo.name, 15000)
        );

        // Sin modal de la extensión. El confirm "Se enviará…" corre en el window del iframe del fancybox: parche en todos los marcos accesibles.
        await ejecutarPaso(item, "inyectar parche confirm en iframes", async () =>
          inyectarParcheConfirmEnArbolAccesible()
        );
        console.log("[MAU] Envío automático: clic en Enviar; window.confirm del marco correcto debe devolver OK solo.");
        const ordenBotonesFinales = ["Enviar", "Aceptar", "Continuar"];
        await ejecutarPaso(item, "click en cierre final", async () =>
          clickBotonFinalEnOrden(ordenBotonesFinales)
        );
        // Damos tiempo suficiente para que el servidor procese el envío y muestre la confirmación final.
        await dormir(5000);
        validarAlertaSinAdjuntos(inicioFilaTs);
        item.estado = "enviado";
        ok++;
        await window.MAUStorage.aprenderPatron(item.archivo.name, item.requerimiento);
      } catch (e) {
        console.error("[MAU] Error procesando fila:", item.requerimiento, e);
        item.estado = "error";
        if (!item.errorMensaje) item.errorMensaje = e?.message || "Error desconocido.";
        err++;
      }
      renderTabla();
      // Cerrar cualquier fancybox abierto antes de pasar al próximo archivo.
      await cerrarFancyboxAbierto();
      await dormir(2000);
    }
    actualizarProgreso(items.length, items.length, `Finalizado. OK: ${ok}, Saltados: ${skip}, Error: ${err}`);
    // PASADA FINAL: entrar a cada Borrador y apretar Enviar.
    try {
      await pasadaFinalBorradores();
    } catch (e) {
      console.warn("[MAU] Error en pasada final de borradores:", e);
    }
  }

  async function pasadaFinalBorradores() {
    console.log("[MAU] === Pasada final: cerrando borradores ===");
    let pasada = 0;
    while (pasada < 3) {
      pasada++;
      const filas = Array.from(document.querySelectorAll("tr")).filter((tr) => {
        const txt = (tr.textContent || "").toLowerCase();
        if (!txt.includes("borrador") || !txt.includes("pend env")) return false;
        // No reenviar si ya está completo (1/1, 2/2, etc.)
        const countMatch = txt.match(/\((\d+)\s*\/\s*(\d+)\)/);
        if (countMatch) {
          const enviados = parseInt(countMatch[1], 10);
          const totales = parseInt(countMatch[2], 10);
          if (enviados >= totales && totales > 0) return false;
        }
        return true;
      });
      console.log(`[MAU] Pasada ${pasada}: ${filas.length} borrador(es) encontrados.`);
      if (!filas.length) break;
      for (const tr of filas) {
        const link = tr.querySelector("a");
        if (!link) continue;
        const nombre = (link.textContent || "").trim();
        try {
          console.log("[MAU] Cerrando borrador:", nombre);
          link.click();
          // Esperar más tiempo para que el popup cargue completamente
          await dormir(4000);
          // Buscar Enviar dentro del fancybox
          const iframe = document.querySelector("iframe.fancybox-iframe");
          const docPop = iframe?.contentDocument || iframe?.contentWindow?.document;
          if (!docPop) { console.warn("[MAU] No abrió el popup."); await cerrarFancyboxAbierto(); continue; }
          // Inyectar parche confirm en todos los iframes accesibles
          try { await inyectarParcheConfirmEnArbolAccesible(); } catch (e) {}
          await dormir(1000);
          // Buscar el botón Enviar (exacto, en el iframe)
          const docs = [];
          const recorrer = (d) => {
            if (!d || docs.includes(d)) return;
            docs.push(d);
            Array.from(d.querySelectorAll("iframe")).forEach((f) => recorrer(f.contentDocument || f.contentWindow?.document));
          };
          recorrer(docPop);
          let btnEnviar = null;
          for (const d of docs) {
            const candidatos = Array.from(d.querySelectorAll("a,button,input[type=button],input[type=submit]"));
            console.log("[MAU] Botones en popup:", candidatos.map(el => `"${(el.textContent || el.value || "").trim()}"`).join(", "));
            btnEnviar = candidatos.find((el) => (el.textContent || el.value || "").trim().toLowerCase() === "enviar")
              || candidatos.find((el) => (el.textContent || el.value || "").toLowerCase().includes("enviar"));
            if (btnEnviar) break;
          }
          if (btnEnviar) {
            console.log("[MAU] Click en Enviar (pasada final).");
            btnEnviar.click();
            await dormir(6000);
          } else {
            console.warn("[MAU] No se encontró botón Enviar en el popup de:", nombre);
          }
          await cerrarFancyboxAbierto();
          await dormir(2000);
        } catch (e) {
          console.warn("[MAU] Error cerrando borrador", nombre, e);
          try { await cerrarFancyboxAbierto(); } catch {}
        }
      }
    }
    console.log("[MAU] === Pasada final terminada ===");
  }

  async function esperarCambioPostEnviar(boton, timeoutMs) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      // 1) El botón ya no está conectado al DOM (popup cerrado)
      if (!boton.isConnected) return true;
      // 2) El botón quedó oculto
      if (boton.offsetParent === null) return true;
      // 3) Aparece un texto típico de éxito o de cambio de estado
      const docs = obtenerDocumentosIframesAnidados();
      for (const d of docs) {
        const t = (d?.body?.innerText || "").toLowerCase();
        if (
          t.includes("pendiente de recepción") ||
          t.includes("pendiente de recepcion") ||
          t.includes("enviado correctamente") ||
          t.includes("se enviará")
        ) return true;
      }
      await dormir(250);
    }
    return false;
  }

  function parsearFechaSitio(txt) {
    // Acepta dd/mm/yyyy o dd/mm/yyyy hh:mm
    if (!txt) return 0;
    const m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return 0;
    const [, dd, mm, yyyy, hh, mi] = m;
    return new Date(+yyyy, +mm - 1, +dd, +(hh || 0), +(mi || 0)).getTime();
  }

  /**
   * Busca el link vivo en el DOM para un requerimiento.
   * Si se pasa recursoEsperado, desambigua entre filas con el mismo nombre de requerimiento
   * buscando la que tenga el Recurso correcto.
   */
  function buscarLinkRequerimientoVivo(nombreReq, recursoEsperado) {
    const idxRecurso = detectarIndiceColumnaRecurso();
    const filas = Array.from(document.querySelectorAll("tr")).filter((tr) => {
      const directTds = tr.querySelectorAll(":scope > td");
      return directTds.length >= 4 && !tr.querySelector("table");
    });

    // Buscar en dos pasadas: primero filas con "pend envío", luego cualquier fila.
    // Esto permite subir a requerimientos que no están en estado pendiente pero sí en la tabla.
    const pasadas = [
      filas.filter(tr => /pend envio|pend envío/i.test(textoPlano(tr.textContent || ""))),
      filas
    ];
    for (const conjunto of pasadas) {
      let fallback = null;
      for (const tr of conjunto) {
        const link = tr.querySelector("a");
        if (!link) continue;
        const nombreLink = textoPlano(link.textContent || "");
        const quitarPer = (s) => (s || "").replace(/-\d{4}-\d+.*$/i, "").trim();
        const linkBase = quitarPer(nombreLink);
        const reqBase  = quitarPer(nombreReq);
        const coincideNombre = nombreLink === nombreReq
          || nombreLink.startsWith(nombreReq) || nombreReq.startsWith(nombreLink)
          || linkBase === reqBase;
        if (!coincideNombre) continue;
        if (!recursoEsperado || !recursoEsperado.apellido) return link;
        const celdas = tr.querySelectorAll(":scope > td");
        if (idxRecurso >= 0 && celdas[idxRecurso]) {
          const recursoFila = parsearRecurso(celdas[idxRecurso]);
          const apeEsperado = (recursoEsperado.apellido || "").toLowerCase();
          const apeFila = (recursoFila.apellido || "").toLowerCase();
          if (apeEsperado && apeFila && apeFila.includes(apeEsperado)) return link;
        }
        if (!fallback) fallback = link;
      }
      if (fallback) return fallback;
    }
    return null;
  }

  async function cerrarFancyboxAbierto() {
    // Espera activa: primero deja que aparezcan y se cierren todos los popups/confirmaciones
    // posteriores al envío. Auto-clickea cualquier "Aceptar"/"OK" que aparezca en dialogs del sitio.
    const timeoutTotal = 30000;
    const inicio = Date.now();
    let limpioDesde = 0;
    // Mínimo tiempo continuo de pantalla limpia antes de declarar cerrado todo.
    const MS_LIMPIO_CONTINUO = 2000;

    while (Date.now() - inicio < timeoutTotal) {
      try {
        // 1) Auto-aceptar cualquier diálogo de confirmación jQuery-UI o alert del sitio
        const botonesAceptar = Array.from(
          document.querySelectorAll(
            ".ui-dialog-buttonset button, .ui-dialog button, .modal button, .fancybox-inner button"
          )
        ).filter((b) => {
          const t = (b.textContent || b.value || "").trim().toLowerCase();
          return /^(aceptar|ok|cerrar|continuar)$/.test(t);
        });
        botonesAceptar.forEach((b) => { try { b.click(); } catch (e) {} });

        // 2) Apretar "Volver" en cualquier iframe anidado (cierra el popup tras envío exitoso)
        try {
          const docs = obtenerDocumentosIframesAnidados();
          for (const d of docs) {
            const volver = Array.from(
              d.querySelectorAll("a,button,input[type=button],input[type=submit]")
            ).find((el) => /^volver$/i.test((el.textContent || el.value || "").trim()));
            if (volver) { volver.click(); break; }
          }
        } catch (e) {}

        // 3) Intentar cerrar fancybox con el botón propio
        const cierres = document.querySelectorAll(
          ".fancybox-close, .fancybox-item.fancybox-close, a.fancybox-close"
        );
        cierres.forEach((b) => { try { b.click(); } catch (e) {} });

        // 3) Chequear estado "limpio": sin fancybox, sin overlay blockUI, sin ui-dialog visible
        const hayFancybox = !!document.querySelector("iframe.fancybox-iframe, .fancybox-overlay:not([style*='display: none'])");
        const hayBlockUi = !!document.querySelector(".blockUI.blockOverlay, .blockUI.blockMsg");
        const hayUiDialog = Array.from(document.querySelectorAll(".ui-dialog")).some(
          (d) => d.offsetParent !== null
        );

        if (!hayFancybox && !hayBlockUi && !hayUiDialog) {
          // Marcamos el inicio del estado limpio y exigimos que se mantenga MS_LIMPIO_CONTINUO seguidos.
          if (limpioDesde === 0) limpioDesde = Date.now();
          if (Date.now() - limpioDesde >= MS_LIMPIO_CONTINUO) return;
        } else {
          limpioDesde = 0;
        }
      } catch (e) {
        console.warn("[MAU] Error en cerrarFancyboxAbierto:", e);
      }
      await dormir(300);
    }
    console.warn("[MAU] cerrarFancyboxAbierto: timeout esperando cierre de popups.");
  }

  // Inyeccion robusta: espera iframes listos y busca input file en anidaciones.
  async function inyectarArchivo(file) {
    const timeoutMs = 8000;
    const intervaloMs = 200;
    const inicio = Date.now();
    let ultimoDiagnostico = "";

    while (Date.now() - inicio < timeoutMs) {
      const iframePrincipal = document.querySelector("iframe.fancybox-iframe");
      const docPrincipal = iframePrincipal?.contentDocument || iframePrincipal?.contentWindow?.document;
      if (!iframePrincipal || !docPrincipal || docPrincipal.readyState !== "complete") {
        await dormir(intervaloMs);
        continue;
      }

      const iframeInterno = await buscarPrimerIframeCompleto(docPrincipal);
      if (!iframeInterno) {
        ultimoDiagnostico = "Iframe interno no disponible o sin readyState complete.";
        await dormir(intervaloMs);
        continue;
      }

      const docInterno = iframeInterno.contentDocument || iframeInterno.contentWindow?.document;
      const inputFile = buscarInputFileRecursivoEnDocumento(docInterno);
      if (!inputFile) {
        ultimoDiagnostico = "No apareció input[type=file] en iframe interno/anidados.";
        await dormir(intervaloMs);
        continue;
      }

      const dt = new DataTransfer();
      dt.items.add(file);
      inputFile.files = dt.files;
      inputFile.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const estructura = recolectarEstructuraIframes();
    console.error("[MAU] Timeout inyectando archivo. Diagnóstico:", ultimoDiagnostico);
    console.error("[MAU] Estructura de iframes/inputs detectada:", estructura);
    throw new Error("No se pudo encontrar el campo de carga de archivo dentro del popup (timeout 8s).");
  }

  async function buscarPrimerIframeCompleto(docRaiz) {
    const iframes = Array.from(docRaiz.querySelectorAll("iframe"));
    for (const iframe of iframes) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.readyState === "complete") return iframe;
    }
    return null;
  }

  function buscarInputFileRecursivoEnDocumento(doc) {
    if (!doc) return null;
    const directo = doc.querySelector('input[type="file"]');
    if (directo) return directo;

    const iframes = Array.from(doc.querySelectorAll("iframe"));
    for (const iframe of iframes) {
      const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const encontrado = buscarInputFileRecursivoEnDocumento(subDoc);
      if (encontrado) return encontrado;
    }
    return null;
  }

  function recolectarEstructuraIframes() {
    const raiz = { iframes: [] };
    const iframePrincipal = document.querySelector("iframe.fancybox-iframe");
    if (!iframePrincipal) {
      raiz.error = "No existe iframe.fancybox-iframe en el documento principal.";
      return raiz;
    }
    const docPrincipal = iframePrincipal.contentDocument || iframePrincipal.contentWindow?.document;
    raiz.principal = describirDocumento(docPrincipal, "principal");
    return raiz;
  }

  function describirDocumento(doc, etiqueta) {
    if (!doc) return { etiqueta, disponible: false };
    const descripcion = {
      etiqueta,
      disponible: true,
      readyState: doc.readyState || "desconocido",
      fileInputs: doc.querySelectorAll('input[type="file"]').length,
      iframes: []
    };
    const iframes = Array.from(doc.querySelectorAll("iframe"));
    for (let i = 0; i < iframes.length; i++) {
      const subDoc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
      descripcion.iframes.push(describirDocumento(subDoc, `${etiqueta}.iframe[${i}]`));
    }
    return descripcion;
  }

  // Snippet solicitado por el prompt (mantenido tal cual en lógica).
  async function clickAdjuntar() {
    const timeoutTotal = 15000;
    const inicio = Date.now();
    const selectores = ["a", "button", "input[type='button']", "input[type='submit']"];
    let ultimoDoc = null;

    while (Date.now() - inicio < timeoutTotal) {
      const iframe = await esperarIframeConDocumentoListo(3000).catch(() => null);
      if (!iframe) { await dormir(300); continue; }
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      ultimoDoc = doc;
      const elementos = Array.from(doc.querySelectorAll(selectores.join(",")));
      const adjuntar = elementos.find((el) => {
        const valor = (el.textContent || el.value || "").trim();
        return /adjuntar/i.test(valor);
      });
      if (adjuntar) { adjuntar.click(); return; }
      await dormir(400);
    }

    const htmlDebug = (ultimoDoc?.documentElement?.outerHTML || "").slice(0, 2000);
    console.error("[MAU] No se encontró botón Adjuntar tras 15s. HTML parcial:", htmlDebug);
    throw new Error("No se encontró el botón 'Adjuntar archivo' dentro del popup.");
  }

  async function esperarIframe(timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const iframe = document.querySelector("iframe.fancybox-iframe");
      if (iframe?.contentDocument) return iframe;
      await dormir(250);
    }
    throw new Error("Timeout esperando iframe principal");
  }

  async function esperarSegundoIframe(timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const iframe1 = document.querySelector("iframe.fancybox-iframe");
      const doc1 = iframe1?.contentDocument;
      const iframe2 = doc1?.querySelector("iframe");
      if (iframe2?.contentDocument) return iframe2;
      await dormir(250);
    }
    throw new Error("Timeout esperando iframe secundario");
  }

  async function esperarConfirmacionCargaEnIframes(timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const i1 = document.querySelector("iframe.fancybox-iframe");
      const d1 = i1?.contentDocument;
      const i2 = d1?.querySelector("iframe");
      const d2 = i2?.contentDocument;
      const textoD2 = (d2?.body?.innerText || "");
      const textoD1 = (d1?.body?.innerText || "");
      const textoTotal = `${textoD2}\n${textoD1}`.toLowerCase();
      const hayExito = textoTotal.includes("cargado con éxito") || textoTotal.includes("cargado con exito");
      const hayPrimusLens = textoTotal.includes("primus lens no encontró") || textoTotal.includes("primus lens no encontro");

      if (hayPrimusLens) {
        console.log("[MAU] Aviso de Primus Lens detectado, continuando igual");
        return "primus-lens";
      }
      if (hayExito) return "exito";
      await dormir(250);
    }
    throw new Error("Timeout esperando confirmación de carga (éxito o aviso Primus Lens).");
  }

  async function clickEnIframes(textoBoton) {
    const i1 = document.querySelector("iframe.fancybox-iframe");
    const d1 = i1?.contentDocument;
    const i2 = d1?.querySelector("iframe");
    const d2 = i2?.contentDocument;
    const candidato = buscarBotonEnDocumentos([d2, d1], textoBoton);
    if (candidato) {
      candidato.click();
      return;
    }
    throw new Error(`No se encontró botón "${textoBoton}"`);
  }

  async function clickBotonFinalEnOrden(textosEnOrden) {
    const timeout = 5000;
    const inicio = Date.now();
    const maxIntentos = 3;

    while (Date.now() - inicio < timeout) {
      // SOLO buscar dentro del fancybox/iframes del popup, NO en el document principal
      // (sino agarra "Continuar" de otros lados de la página).
      const docs = [];
      const iframePrincipal = document.querySelector("iframe.fancybox-iframe");
      const docPrincipal = iframePrincipal?.contentDocument || iframePrincipal?.contentWindow?.document;
      const recorrer = (d) => {
        if (!d || docs.includes(d)) return;
        docs.push(d);
        const ifs = Array.from(d.querySelectorAll("iframe"));
        for (const f of ifs) {
          const sub = f.contentDocument || f.contentWindow?.document;
          recorrer(sub);
        }
      };
      recorrer(docPrincipal);
      const candidato = buscarPrimerBotonPorTextosEnOrden(docs, textosEnOrden);
      if (candidato) {
        const texto = (candidato.textContent || candidato.value || "").trim();
        // Click insistente: hasta 3 intentos con verificación de cambio.
        for (let intento = 1; intento <= maxIntentos; intento++) {
          console.log(`[MAU] Botón final clickeado (intento ${intento}):`, texto);
          try { candidato.click(); } catch (e) {}
          // Esperamos a que algo cambie en pantalla: el botón desaparece, el popup cambia, etc.
          const cambio = await esperarCambioPostEnviar(candidato, 3500);
          if (cambio) {
            console.log("[MAU] Click en Enviar surtió efecto.");
            return;
          }
          console.warn(`[MAU] Intento ${intento}: el click no produjo cambio detectable. Reintentando…`);
        }
        // Aún sin confirmar cambio: damos por hecho y seguimos.
        console.warn("[MAU] Se agotaron los intentos de click final, continuando igual.");
        return;
      }
      await dormir(200);
    }

    const docs = obtenerDocumentosIframesAnidados();
    const encontrados = listarTextosClickeables(docs);
    console.error("[MAU] No se encontró botón final. Orden probado:", textosEnOrden);
    console.error("[MAU] Candidatos detectados:", encontrados);
    throw new Error("No se encontró botón final para cerrar el envío (Continuar/Sin novedad/Enviar/Aceptar).");
  }

  function buscarBotonEnDocumentos(documentos, textoBoton) {
    const docs = (documentos || []).filter(Boolean);
    for (const d of docs) {
      const candidato = Array.from(d.querySelectorAll("a,button,input[type=button],input[type=submit]"))
        .find((el) => new RegExp(textoBoton, "i").test((el.textContent || el.value || "").trim()));
      if (candidato) return candidato;
    }
    return null;
  }

  function buscarBotonConRegexEnDocumentos(documentos, regex) {
    const docs = (documentos || []).filter(Boolean);
    for (const d of docs) {
      const candidato = Array.from(d.querySelectorAll("a,button,input[type=button],input[type=submit]"))
        .find((el) => regex.test((el.textContent || el.value || "").trim()));
      if (candidato) return candidato;
    }
    return null;
  }

  function buscarPrimerBotonPorTextosEnOrden(documentos, textosEnOrden) {
    const docs = (documentos || []).filter(Boolean);
    const normalizados = (textosEnOrden || []).map((t) => String(t || "").trim().toLowerCase());
    for (const textoObjetivo of normalizados) {
      for (const d of docs) {
        const candidato = Array.from(d.querySelectorAll("a,button,input[type=button],input[type=submit]"))
          .find((el) => (el.textContent || el.value || "").trim().toLowerCase() === textoObjetivo);
        if (candidato) return candidato;
      }
    }
    return null;
  }

  function obtenerDocumentosIframesAnidados() {
    const docs = [];
    const visitados = new Set();
    const recorrer = (docActual) => {
      if (!docActual || visitados.has(docActual)) return;
      visitados.add(docActual);
      docs.push(docActual);
      const iframes = Array.from(docActual.querySelectorAll("iframe"));
      for (const iframe of iframes) {
        const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
        recorrer(subDoc);
      }
    };

    // Incluimos también el documento principal (a veces los botones del fancybox están ahí).
    recorrer(document);
    const iframePrincipal = document.querySelector("iframe.fancybox-iframe");
    const docPrincipal = iframePrincipal?.contentDocument || iframePrincipal?.contentWindow?.document;
    recorrer(docPrincipal);
    return docs;
  }

  function listarTextosClickeables(documentos) {
    const salida = [];
    const docs = (documentos || []).filter(Boolean);
    for (const d of docs) {
      const items = Array.from(d.querySelectorAll("a,button,input[type=button],input[type=submit]"));
      for (const el of items) {
        const texto = (el.textContent || el.value || "").trim();
        if (!texto) continue;
        salida.push(texto);
      }
    }
    return salida;
  }

  async function esperarCierreAvisoPrimusLens(timeout = 8000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const docs = obtenerDocumentosIframesAnidados();
      const texto = docs.map((d) => d?.body?.innerText || "").join("\n").toLowerCase();
      if (!texto.includes("primus lens no encontró") && !texto.includes("primus lens no encontro")) {
        console.log("[MAU] Modal de Primus Lens cerrado.");
        return true;
      }
      await dormir(200);
    }
    throw new Error("No se cerró el aviso de Primus Lens luego de presionar Continuar.");
  }

  function normalizarParaComparar(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function tokensRelevantesNombreArchivo(nombreArchivo) {
    const base = String(nombreArchivo || "").replace(/^.*[/\\]/, "").replace(/\.pdf$/i, "");
    const partes = base.split(/[\s._-]+/).filter((p) => p.length >= 4);
    return partes.map(normalizarParaComparar);
  }

  function textoIndicaPdfAdjunto(textoPlano, nombreArchivo) {
    const t = normalizarParaComparar(textoPlano);
    if (!t) return false;
    if (t.includes("cargado con exito")) return true;

    const nombreLower = normalizarParaComparar(nombreArchivo);
    if (nombreLower && t.includes(nombreLower)) return true;

    const soloNombre = normalizarParaComparar(nombreArchivo.replace(/^.*[/\\]/, ""));
    if (soloNombre && t.includes(soloNombre)) return true;

    // La UI suele mostrar ruta truncada: ".../Nomina SVO.pdf" (nombre distinto al File real).
    if (/\.\.\/[^\n]+\.pdf/i.test(textoPlano) || /[/\\][^\n]+\.pdf/i.test(textoPlano)) {
      return true;
    }
    if (t.includes(".pdf") && (t.includes("adjuntar") || t.includes("archivo"))) {
      return true;
    }

    for (const tok of tokensRelevantesNombreArchivo(nombreArchivo)) {
      if (tok.length >= 4 && t.includes(tok)) return true;
    }
    return false;
  }

  function documentoTieneInputFileConArchivo(doc) {
    if (!doc) return false;
    const inputs = Array.from(doc.querySelectorAll('input[type="file"]'));
    for (const inp of inputs) {
      try {
        if (inp.files && inp.files.length > 0) return true;
      } catch {
        /* ignore */
      }
    }
    const iframes = Array.from(doc.querySelectorAll("iframe"));
    for (const iframe of iframes) {
      const sub = iframe.contentDocument || iframe.contentWindow?.document;
      if (documentoTieneInputFileConArchivo(sub)) return true;
    }
    return false;
  }

  async function verificarAdjuntoEnFancyboxPrincipal(nombreArchivo, timeout = 15000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const iframePrincipal = document.querySelector("iframe.fancybox-iframe");
      const doc = iframePrincipal?.contentDocument || iframePrincipal?.contentWindow?.document;
      const textoPlano = doc?.body?.innerText || "";

      if (textoIndicaPdfAdjunto(textoPlano, nombreArchivo)) {
        console.log("[MAU] Verificación OK: adjunto detectado por texto en popup principal.");
        return true;
      }
      if (documentoTieneInputFileConArchivo(doc)) {
        console.log("[MAU] Verificación OK: input file con archivo en popup/iframes.");
        return true;
      }
      await dormir(250);
    }
    throw new Error("El archivo no aparece como adjuntado en el popup principal.");
  }

  /**
   * El window.confirm del sitio suele ejecutarse en el iframe del fancybox, no en el top.
   * Inyecta el mismo parche MAIN en cada documento same-origin accesible (recursivo).
   */
  async function inyectarParcheConfirmEnArbolAccesible() {
    let codigoParche = "";
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        const url = chrome.runtime.getURL("page-inject-confirm-patch.js");
        codigoParche = await fetch(url).then((r) => r.text());
      }
    } catch (e) {
      console.warn("[MAU] No se pudo cargar page-inject-confirm-patch.js para inyección:", e);
    }
    if (!codigoParche) {
      console.warn("[MAU] Parche confirm: sin código; confía en content script all_frames.");
      return;
    }

    function inyectarEnDocumento(doc, etiqueta) {
      if (!doc?.defaultView) return;
      const w = doc.defaultView;
      if (w.__mauParcheConfirmInstalado) return;
      try {
        const s = doc.createElement("script");
        s.textContent = codigoParche;
        (doc.head || doc.documentElement).appendChild(s);
        s.remove();
        console.log("[MAU] Parche window.confirm inyectado en contexto:", etiqueta);
      } catch (e) {
        console.warn("[MAU] No se pudo inyectar parche confirm en", etiqueta, e);
      }
    }

    function recorrer(doc, etiqueta) {
      if (!doc) return;
      inyectarEnDocumento(doc, etiqueta);
      Array.from(doc.querySelectorAll("iframe")).forEach((iframe, i) => {
        try {
          const sub = iframe.contentDocument;
          if (sub) recorrer(sub, `${etiqueta}>iframe[${i}]`);
        } catch {
          /* iframe cross-origin */
        }
      });
    }

    recorrer(document, "top");
  }

  function instalarInterceptorAlertasNativas() {
    if (window.__mauAlertHookInstalado) return;
    window.__mauAlertHookInstalado = true;
    const alertOriginal = window.alert ? window.alert.bind(window) : null;
    window.alert = function (mensaje) {
      const texto = String(mensaje || "");
      estado.ultimaAlerta = { mensaje: texto, ts: Date.now() };
      console.warn("[MAU] Alert nativo detectado:", texto);
      if (alertOriginal) return alertOriginal(mensaje);
      return undefined;
    };
  }

  function validarAlertaSinAdjuntos(desdeTs) {
    const alerta = estado.ultimaAlerta || {};
    const texto = String(alerta.mensaje || "").toLowerCase();
    const esSinAdjuntos = texto.includes("informará sin documentos adjuntos")
      || texto.includes("informara sin documentos adjuntos");
    if (alerta.ts >= (desdeTs || 0) && esSinAdjuntos) {
      throw new Error("El archivo no quedó adjuntado, reintentar.");
    }
  }

  function actualizarProgreso(actual, total, texto) {
    const p = total ? Math.round((actual / total) * 100) : 0;
    ui.pText.textContent = texto;
    ui.pInner.style.width = `${p}%`;
  }
  function textoPlano(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function dormir(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function esperarConCountdown(totalMs, onTick) {
    const fin = Date.now() + totalMs;
    while (Date.now() < fin) {
      const restanteMs = fin - Date.now();
      const segRest = Math.ceil(restanteMs / 1000);
      if (typeof onTick === "function") {
        try { onTick(segRest); } catch (_e) { /* noop */ }
      }
      await dormir(Math.min(1000, restanteMs));
    }
  }

  async function ejecutarPaso(item, paso, fn) {
    try {
      return await fn();
    } catch (error) {
      const msg = error?.message || "Error sin detalle";
      item.errorMensaje = `Falló en "${paso}": ${msg}`;
      throw new Error(item.errorMensaje);
    }
  }

  async function esperarIframeConDocumentoListo(timeout = 5000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const iframe = document.querySelector("iframe.fancybox-iframe");
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (iframe && doc && (doc.readyState === "interactive" || doc.readyState === "complete")) {
        const hayElementos = doc.querySelector("a,button,input[type='button'],input[type='submit']");
        if (hayElementos) return iframe;
      }
      await dormir(150);
    }

    const iframe = document.querySelector("iframe.fancybox-iframe");
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const htmlDebug = (doc?.documentElement?.outerHTML || "").slice(0, 4000);
      console.error("[MAU] Timeout esperando contenido del iframe principal. HTML parcial:", htmlDebug);
    }
    throw new Error("Timeout esperando que cargue el popup del requerimiento.");
  }

  function buscarMejorPatron(patrones, firmaTipos, textos) {
    const normStr = (s) =>
      (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

    const multisetIgual = (a, b) => {
      if (a.length !== b.length) return false;
      const sa = [...a].sort();
      const sb = [...b].sort();
      return sa.every((v, i) => v === sb[i]);
    };

    const puntuar = (patron) => {
      if (!Array.isArray(patron.bloquesModal) || !patron.bloquesModal.length) return -1;

      const tiposGuardados = Array.isArray(patron.firmaTipos) ? patron.firmaTipos : [];
      if (tiposGuardados.length > 0) {
        // Patrón creado con Claude: comparar tipos en cualquier orden
        if (!multisetIgual(tiposGuardados, firmaTipos)) return -1;
      } else {
        // Patrón creado sin Claude: comparar por cantidad de páginas
        const totalGuardado = patron.totalPaginas ||
          Math.max(0, ...(patron.bloquesModal.flatMap((b) => b.paginas || []).concat([0])));
        if (totalGuardado > 0 && totalGuardado !== firmaTipos.length) return -1;
      }

      // Desambiguación por texto: palabras del OCR que aparecen en el patrón
      const textoDocumento = textos
        .map((t) => [t.textoEstable, t.apellido, t.nombre, t.cuil].filter(Boolean).join(" "))
        .join(" ");
      const wordsDoc = new Set(normStr(textoDocumento).split(/\s+/).filter((w) => w.length > 2));

      const textoPatron = patron.bloquesModal
        .flatMap((b) => [b.nombre, ...(b.requerimientos || [])])
        .join(" ");
      const wordsPatron = normStr(textoPatron).split(/\s+/).filter((w) => w.length > 2);

      return wordsPatron.filter((w) => wordsDoc.has(w)).length;
    };

    const candidatos = patrones
      .map((p) => ({ patron: p, score: puntuar(p) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    return candidatos[0]?.patron || null;
  }

  function remapearBloquesPorTexto(bloquesPatron, textos, firmaTiposPatron) {
    const normStr = (s) =>
      (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

    // Construir los tipos esperados por bloque a partir del patrón original
    // firmaTiposPatron[i] = etiqueta de la página (i+1) en el patrón guardado
    const bloquesConTipos = bloquesPatron.map((b) => {
      const tiposEsperados = (b.paginas || []).map((p) => (firmaTiposPatron ? firmaTiposPatron[p - 1] : null) || "desconocido");
      return { ...b, tiposEsperados };
    });

    // Pool de páginas disponibles del PDF actual
    const disponibles = textos.map((t) => ({ ...t, usada: false }));

    const nuevasPaginas = bloquesConTipos.map(() => []);

    for (let bi = 0; bi < bloquesConTipos.length; bi++) {
      const b = bloquesConTipos[bi];
      const apellidoBloque = normStr(b.meta?.apellido || "");
      const cuilBloque = normStr(b.meta?.cuil || "").replace(/[^0-9]/g, "");

      for (const tipoEsperado of b.tiposEsperados) {
        // Candidatos: misma etiqueta o mismo id, no usados
        const candidatos = disponibles.filter(
          (d) => !d.usada && (d.etiqueta === tipoEsperado || d.id === tipoEsperado || normStr(d.etiqueta) === normStr(tipoEsperado))
        );
        if (!candidatos.length) continue;

        if (candidatos.length === 1) {
          // Único candidato con ese tipo → asignar directo
          candidatos[0].usada = true;
          nuevasPaginas[bi].push(candidatos[0].pagina);
        } else {
          // Varios candidatos del mismo tipo → usar nombre/CUIL para desempatar
          const scored = candidatos.map((c) => {
            let score = 0;
            const cuilPag = normStr(c.cuil || "").replace(/[^0-9]/g, "");
            const apellidoPag = normStr(c.apellido || "");
            const nombrePag = normStr(c.nombre || "");
            const textoPag = normStr([c.textoEstable, c.apellido, c.nombre].join(" "));
            if (cuilBloque && cuilPag && cuilPag === cuilBloque) score += 10;
            if (apellidoBloque && apellidoPag && apellidoPag.includes(apellidoBloque)) score += 5;
            if (apellidoBloque && textoPag.includes(apellidoBloque)) score += 2;
            return { c, score };
          });
          scored.sort((a, b) => b.score - a.score);
          scored[0].c.usada = true;
          nuevasPaginas[bi].push(scored[0].c.pagina);
        }
      }
    }

    // Fallback: si algún bloque quedó vacío, usar sus páginas originales del patrón
    return bloquesConTipos.map((b, bi) => ({
      ...b,
      paginas: nuevasPaginas[bi].length ? nuevasPaginas[bi].sort((a, c) => a - c) : b.paginas
    }));
  }

  async function analizarSabana() {
    const file = estado.sabanaPendiente;
    if (!file) {
      mostrarToast("Primero soltá o seleccioná un PDF sábana.");
      return;
    }
    const btn = ui.modalDividir;
    if (btn) btn.disabled = true;
    try {
      if (!estado.requerimientos.length) await detectarRequerimientosPendientes();

      ui.pText.textContent = "Analizando páginas con Claude…";
      const textos = await window.MAUOcrEngine.extraerTextoPorPagina(file, (info) => {
        if (info.pagina != null && info.totalPaginas != null) {
          const pct = Math.round((info.pagina / info.totalPaginas) * 100);
          actualizarProgreso(info.pagina, info.totalPaginas, info.mensaje || `Analizando página ${info.pagina}/${info.totalPaginas}`);
          ui.pInner.style.width = `${pct}%`;
        } else if (info.mensaje) {
          ui.pText.textContent = info.mensaje;
        }
      });

      const firmaTipos = textos.map((t) => t.etiqueta || "desconocido");
      const patrones = (await window.MAUStorage.leerPatronesSabana()) || [];
      const match = buscarMejorPatron(patrones, firmaTipos, textos);

      if (match) {
        // Reasignar páginas usando tipo primero y nombre/CUIL para desempatar.
        const bloquesRemapeados = remapearBloquesPorTexto(match.bloquesModal, textos, match.firmaTipos);
        mostrarToast(`Patrón «${match.nombre}» encontrado. Aplicando…`);
        ui.pText.textContent = `Patrón «${match.nombre}» aplicado automáticamente.`;
        await aplicarBloquesModal(file, bloquesRemapeados);
      } else {
        mostrarToast("No se encontró un patrón para esta sábana. Usá 'Crear / Ajustar mapeo' primero.");
        ui.pText.textContent = "Sin patrón guardado para esta sábana. Creá uno con 'Crear / Ajustar mapeo'.";
      }
    } catch (e) {
      console.error("[MAU] Error al analizar sábana:", e);
      ui.pText.textContent = `Error: ${e.message || e}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function aplicarBloquesModal(file, bloques) {
    ui.pText.textContent = "Dividiendo PDF…";
    // Armar mapeos para dividirPdfPorRangos: cada bloque genera UN archivo con sus páginas.
    // Como las páginas pueden no ser contiguas, extendemos dividirPdfPorRangos usando pdf-lib directamente acá.
    await window.MAUPdfSplitter.cargarLibreria(
      "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
      "PDFLib"
    );
    const bytes = await file.arrayBuffer();
    const src = await window.PDFLib.PDFDocument.load(bytes);

    const archivosPorBloque = [];
    for (const b of bloques) {
      if (!b.paginas.length || !b.requerimientos.length) continue;
      const nuevo = await window.PDFLib.PDFDocument.create();
      const indices = b.paginas.map((n) => n - 1).filter((i) => i >= 0 && i < src.getPageCount());
      const pages = await nuevo.copyPages(src, indices);
      pages.forEach((p) => nuevo.addPage(p));
      const out = await nuevo.save();
      const etiqueta = (b.nombre || "bloque").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
      const archivo = new File([out], `${file.name.replace(/\.pdf$/i, "")}-${etiqueta}.pdf`, { type: "application/pdf" });
      archivosPorBloque.push({ archivo, requerimientos: b.requerimientos, meta: b.meta || null });
    }

    // Asignar cada archivo a sus requerimientos (uno puede ir a varios)
    for (const item of archivosPorBloque) {
      for (const nombreReq of item.requerimientos) {
        // Duplicar el File para cada requerimiento (por seguridad al subir)
        const copia = new File([await item.archivo.arrayBuffer()], item.archivo.name, { type: "application/pdf" });
        asignarArchivoARequerimiento(nombreReq, copia, item.meta || null);
      }
    }

    renderTabla();
    resetSabanaUi();
    mostrarToast(`Listo: ${archivosPorBloque.length} bloque(s) asignados. Revisá la tabla y apretá «Procesar todo».`);
  }

  function instalarBloqueoGlobalDrop() {
    const handler = (e) => {
      const sobrePanel = ui.panel.contains(e.target) || e.composedPath().includes(ui.panel);
      if (!sobrePanel) return;
      if (!["dragenter", "dragover", "drop"].includes(e.type)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type !== "drop") ui.dropzone.classList.add("mau-over");
      if (e.type === "drop") ui.dropzone.classList.remove("mau-over");
    };
    window.addEventListener("dragenter", handler, true);
    window.addEventListener("dragover", handler, true);
    window.addEventListener("drop", handler, true);
  }

  // ===================== GESTOR DE MAPEO =====================

  /**
   * Abre el gestor de mapeo. Si hay mapeos guardados los muestra.
   * Si no hay, o el usuario elige "nuevo", abre el flujo de sábana para crear uno.
   */
  function pedirPdfAlUsuario() {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/pdf,.pdf";
      inp.addEventListener("change", () => resolve(inp.files?.[0] || null));
      inp.addEventListener("cancel", () => resolve(null));
      inp.click();
    });
  }

  function elegirPatronUI(patrones) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "mau-confirm";
      const box = document.createElement("div");
      box.className = "mau-confirm-box";
      box.style.cssText = "width:460px;max-height:70vh;display:flex;flex-direction:column;padding:0;overflow:hidden;";

      const hdr = document.createElement("div");
      hdr.style.cssText = "padding:14px 18px 12px;border-bottom:1px solid rgba(148,163,184,.15);font-weight:700;font-size:15px;flex-shrink:0;";
      hdr.textContent = "¿Con qué mapeo abrís?";
      box.appendChild(hdr);

      const lista = document.createElement("div");
      lista.style.cssText = "overflow-y:auto;flex:1;padding:10px 14px;display:flex;flex-direction:column;gap:7px;";

      const mkBtn = (label, sub, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:10px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px;width:100%;";
        btn.innerHTML = `<span style="font-weight:600;font-size:13px;color:#e2e8f0;">${escapeHtml(label)}</span>${sub ? `<span style="font-size:11px;color:#64748b;">${escapeHtml(sub)}</span>` : ""}`;
        btn.addEventListener("mouseenter", () => { btn.style.borderColor = "rgba(56,189,248,.4)"; btn.style.background = "rgba(56,189,248,.07)"; });
        btn.addEventListener("mouseleave", () => { btn.style.borderColor = "rgba(148,163,184,.18)"; btn.style.background = "rgba(148,163,184,.07)"; });
        btn.addEventListener("click", () => { overlay.remove(); onClick(); });
        return btn;
      };

      patrones.forEach((p) => {
        const n = Array.isArray(p.bloquesModal) ? p.bloquesModal.length : 0;
        const pags = p.totalPaginas || (Array.isArray(p.firmaTipos) ? p.firmaTipos.length : 0);
        const sub = [pags ? `${pags} pág.` : null, n ? `${n} bloque(s)` : null].filter(Boolean).join(" · ");
        lista.appendChild(mkBtn(p.nombre || "(sin nombre)", sub, () => resolve(p)));
      });
      lista.appendChild(mkBtn("➕ Nuevo (empezar desde cero)", "", () => resolve(null)));

      box.appendChild(lista);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { overlay.remove(); resolve(null); } });
    });
  }

  async function abrirGestorMapeo() {
    // 1. Asegurar PDF
    let file = estado.sabanaPendiente;
    if (!file) {
      file = await pedirPdfAlUsuario();
      if (!file) return;
      estado.sabanaPendiente = file;
      mostrarSeccionSabana(true);
    }

    if (!window.MAUModalSeleccion) {
      mostrarToast("Modal no disponible. Recargá la extensión.");
      return;
    }
    if (!estado.requerimientos.length) await detectarRequerimientosPendientes();

    // 2. Elegir patrón a pre-cargar
    const patrones = (await window.MAUStorage.leerPatronesSabana()) || [];
    let patronElegido = null;
    if (patrones.length === 1) {
      patronElegido = patrones[0];
    } else if (patrones.length > 1) {
      patronElegido = await elegirPatronUI(patrones);
    }

    const bloquesIniciales = patronElegido?.bloquesModal || [];
    const nombreBase = patronElegido?.nombre
      || `mapeo-${new Date().toISOString().slice(0, 10)}-${file.name.replace(/\.pdf$/i, "")}`;

    // 3. Abrir modal grande con bloques pre-cargados
    await window.MAUModalSeleccion.abrir({
      file,
      requerimientos: estado.requerimientos,
      bloquesIniciales,
      nombrePatron: patronElegido?.nombre || "",
      onConfirm: async (bloques, numPaginas) => {
        // Claude es obligatorio: lee TODAS las páginas para:
        // 1. Saber de quién es el documento (apellido, CUIL, patente) → meta de cada bloque
        // 2. Guardar el tipo de cada página → firmaTipos completo para el modo Trabajar
        // IMPORTANTE: no usar paginasEspecificas aquí porque las páginas NO asignadas a bloques
        // (ej: recibos de haberes) también necesitan su tipo guardado en firmaTipos.
        let textosPorPagina = [];
        try {
          ui.pText.textContent = "Leyendo contenido de las páginas con Claude…";
          textosPorPagina = await window.MAUOcrEngine.extraerTextoPorPagina(
            file,
            (info) => {
              if (info.pagina != null) {
                actualizarProgreso(info.pagina, info.totalPaginas, info.mensaje || "");
                ui.pInner.style.width = `${Math.round((info.pagina / info.totalPaginas) * 100)}%`;
              }
            }
            // Sin paginasEspecificas → clasifica TODAS las páginas
          );
        } catch (e) {
          alertarErrorOcr(e);
          ui.pText.textContent = "Sin procesamiento en curso";
          return; // No continuar sin Claude
        }

        // Armar texto estable por bloque y poblar meta desde OCR de Claude.
        // La meta (apellido, cuil, patente, etc.) viene de la primera página del bloque
        // que tenga datos relevantes — esto permite que asignarArchivoARequerimiento
        // elija la fila correcta cuando hay varios empleados con el mismo requerimiento.
        const bloquesConTexto = bloques.map((b) => {
          const textoBloque = b.paginas
            .map((p) => textosPorPagina.find((t) => t.pagina === p)?.textoEstable || "")
            .filter(Boolean)
            .join(" ");
          const metaPagina = b.paginas
            .map((p) => textosPorPagina.find((t) => t.pagina === p))
            .find((t) => t && (t.apellido || t.cuil || t.patente));
          const meta = metaPagina
            ? { apellido: metaPagina.apellido || "", nombre: metaPagina.nombre || "", cuil: metaPagina.cuil || "", patente: metaPagina.patente || "", periodo: metaPagina.periodo || "" }
            : (b.meta || {});
          return {
            nombre: b.nombre,
            paginas: b.paginas,
            requerimientos: b.requerimientos,
            textoEstableBloque: textoBloque,
            meta
          };
        });

        // Firma de tipos (clasificación por página)
        const firmaTiposNueva = Array.from({ length: numPaginas || 0 }, (_, i) => {
          const t = textosPorPagina.find((x) => x.pagina === i + 1);
          return t?.etiqueta || "desconocido";
        });

        try {
          await window.MAUStorage.guardarPatronSabana({
            nombre: nombreBase,
            firmaTipos: firmaTiposNueva,
            totalPaginas: numPaginas || 0,
            bloquesModal: bloquesConTexto
          });
          mostrarToast(`Mapeo guardado: ${bloques.length} bloque(s) con texto.`);
        } catch (err) {
          console.warn("[MAU] No se pudo guardar el patrón:", err);
        }

        // Guardar imágenes de referencia en IndexedDB para comparación futura
        if (window.MAUImageDB && window.MAUOcrEngine?.renderizarPaginas) {
          try {
            ui.pText.textContent = "Guardando imágenes de referencia…";
            const imagenesRef = await window.MAUOcrEngine.renderizarPaginas(
              file,
              (info) => actualizarProgreso(info.pagina, info.totalPaginas, `Guardando imagen ${info.pagina}/${info.totalPaginas}…`),
              { escala: 120, calidad: 0.55 }
            );
            await window.MAUImageDB.guardarImagenesPatron(nombreBase, {
              imagenes: imagenesRef,
              bloques: bloquesConTexto.map((b) => ({
                nombre: b.nombre,
                paginas: b.paginas,
                requerimientos: b.requerimientos,
                meta: b.meta || {}
              }))
            });
            console.log(`[MAU] Imágenes de referencia guardadas para "${nombreBase}" (${imagenesRef.length} páginas)`);
          } catch (e) {
            console.warn("[MAU] No se pudieron guardar las imágenes de referencia:", e);
          }
        }

        resetSabanaUi();
        await aplicarBloquesModal(file, bloquesConTexto);
      }
    });
  }

  // Exponer funciones internas para que el background (flujo de Telegram)
  // pueda disparar la subida usando la misma lógica que el modo Trabajar.
  window.MAUPanel = {
    estado,
    detectarRequerimientosPendientes,
    procesarArchivosPdf,   // ← Telegram usa esto: mismo matching tipo+CUIL que el panel
    aplicarBloquesModal,   // ← fallback por compatibilidad
    procesarTodo,
    asignarArchivoARequerimiento,
    renderTabla
  };
})();