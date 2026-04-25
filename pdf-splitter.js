(function () {
  async function cargarLibreria(url, globalName) {
    if (window[globalName]) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function dividirPdfPorRangos(file, mapeos) {
    await cargarLibreria("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js", "PDFLib");
    const bytes = await file.arrayBuffer();
    const src = await window.PDFLib.PDFDocument.load(bytes);
    const paginasTotales = src.getPageCount();
    const resultados = [];

    for (const map of mapeos) {
      const nuevo = await window.PDFLib.PDFDocument.create();
      const indices = [];
      for (let i = map.desde; i <= map.hasta; i++) {
        if (i >= 1 && i <= paginasTotales) indices.push(i - 1);
      }
      const pages = await nuevo.copyPages(src, indices);
      pages.forEach((p) => nuevo.addPage(p));
      const out = await nuevo.save();
      const etiqueta = (map.nombre || map.requerimiento || "parte").replace(/[/\\?%*:|"<>]/g, "-");
      resultados.push(
        new File([out], `${file.name.replace(/\.pdf$/i, "")}-${etiqueta}.pdf`, { type: "application/pdf" })
      );
    }
    return resultados;
  }

  /**
   * Detecta bloques por contenido (no por orden ni cantidad de paginas).
   * Usa las reglas de window.MAUMatcher para clasificar cada pagina y agrupa
   * paginas consecutivas que pertenecen al mismo tipo de documento.
   *
   * @param {Array<{pagina:number,texto:string}>} textosPorPagina
   * @param {Array} [reglasOverride] opcional, si no se pasa usa MAUMatcher.reglas
   * @returns {Array<{id:string|null,nombre:string,desde:number,hasta:number}>}
   */
  function detectarBloques(textosPorPagina, _reglasOverride) {
    const orden = [...(textosPorPagina || [])].sort((a, b) => a.pagina - b.pagina);
    if (!orden.length) return [];

    // Lista blanca de ids que sabemos agrupar como familia (mismo requerimiento)
    // Cada familia = conjunto de ids que se mergean si son consecutivos
    const FAMILIAS = [
      ["f931"],
      ["nomina_f931"],
      ["acuse_f931", "vep_f931", "pago_f931"], // bloque "Pago de 931" (3-5 en Lista B)
      ["boleta_uocra", "dj_uocra", "pago_uocra"], // bloque "Pago de aportes sindicales"
      ["vep_autonomo", "pago_autonomo"], // Desestimar
      ["recibo_haberes", "transferencia_desempleo"], // Se mergea por EMPLEADO (misma familia pero cortando por CUIL/apellido)
      ["seguro_rc_pago"],
      ["seguro_automotor_pago"], // se corta por patente
      ["clausula_no_repeticion"],
      ["art_nomina"],
      ["vida_obligatorio"],
      ["capacitacion"],
      ["grua"],
      ["desconocido"]
    ];

    function familiaDe(id) {
      for (const f of FAMILIAS) if (f.includes(id)) return f.join("|");
      return id || "desconocido";
    }

    // Ids que se cortan por metadato específico dentro de la misma familia
    function claveMetadato(p) {
      if (!p) return "";
      if (p.id === "recibo_haberes" || p.id === "transferencia_desempleo") {
        // Clave = primera palabra del apellido (más estable que CUIL escaneado).
        // Si no hay apellido, cae al CUIL.
        const ape = (p.apellido || "").toUpperCase().split(/\s+/)[0] || "";
        if (ape) return ape;
        return (p.cuil || "").replace(/\D/g, "");
      }
      if (p.id === "seguro_automotor_pago") {
        return (p.patente || "").toUpperCase();
      }
      return "";
    }

    // Herencia suave: página "desconocido" entre dos iguales hereda
    for (let i = 1; i < orden.length - 1; i++) {
      const prev = orden[i - 1];
      const cur = orden[i];
      const next = orden[i + 1];
      if ((cur.id === "desconocido" || !cur.id) && prev.id && prev.id === next.id) {
        cur.id = prev.id;
        cur.etiqueta = cur.etiqueta || prev.etiqueta;
        if (!cur.cuil && prev.cuil && prev.cuil === next.cuil) cur.cuil = prev.cuil;
        if (!cur.apellido && prev.apellido && prev.apellido === next.apellido) cur.apellido = prev.apellido;
        if (!cur.patente && prev.patente && prev.patente === next.patente) cur.patente = prev.patente;
      }
    }

    const bloques = [];
    for (const p of orden) {
      const fam = familiaDe(p.id);
      const meta = claveMetadato(p);
      const ult = bloques[bloques.length - 1];

      const mismaFamilia = ult && ult.familia === fam;
      const mismoMeta = ult && ult.metaClave === meta;

      if (mismaFamilia && mismoMeta) {
        ult.hasta = p.pagina;
        // Consolidar metadatos si están vacíos
        if (!ult.cuil && p.cuil) ult.cuil = p.cuil;
        if (!ult.apellido && p.apellido) ult.apellido = p.apellido;
        if (!ult.nombre && p.nombre) ult.nombre = p.nombre;
        if (!ult.patente && p.patente) ult.patente = p.patente;
        if (!ult.periodo && p.periodo) ult.periodo = p.periodo;
      } else {
        const nombre = armarNombreBloque(p);
        bloques.push({
          id: p.id || "desconocido",
          familia: fam,
          metaClave: meta,
          nombre,
          desde: p.pagina,
          hasta: p.pagina,
          cuil: p.cuil || "",
          apellido: p.apellido || "",
          nombreEmp: p.nombre || "",
          patente: p.patente || "",
          periodo: p.periodo || "",
          desestimar: (p.id === "vep_autonomo" || p.id === "pago_autonomo")
        });
      }
    }

    return bloques;
  }

  function armarNombreBloque(p) {
    const base = p.etiqueta || p.texto || p.id || "Sin identificar";
    const extras = [];
    if (p.apellido || p.nombre) extras.push(`${p.apellido || ""} ${p.nombre || ""}`.trim());
    if (p.patente) extras.push(`patente ${p.patente}`);
    return extras.length ? `${base} — ${extras.join(" · ")}` : base;
  }

  window.MAUPdfSplitter = { dividirPdfPorRangos, detectarBloques, cargarLibreria };
})();
