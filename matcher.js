(function () {
  const reglas = [
    { id: "f931", claves: ["f931", "f 931", "formulario 931", "formulario931"], contiene: "f 931", etiquetaBloque: "F 931" },
    { id: "nomina_f931", claves: ["nomina f 931", "nomina f931", "nomina del personal", "nomina personal", "n mina"], contiene: "nomina f 931", etiquetaBloque: "Nomina F 931" },
    { id: "aportes", claves: ["aportes sindicales", "sindicales", "aportes"], contiene: "aportes sindicales", etiquetaBloque: "Aportes sindicales" },
    { id: "capacitacion", claves: ["capacitacion", "capacitaci n", "asistencia", "planilla de asistencia"], contiene: "capacitacion", etiquetaBloque: "Capacitacion" },
    { id: "grua", claves: ["credencial", "operador de grua", "grua", "gruas"], contiene: "credencial op. gruas", etiquetaBloque: "Credencial gruas" },
    { id: "seguro_rc", claves: ["responsabilidad civil", "seguro rc", "poliza rc", "seguro de responsabilidad"], contiene: "seguro de responsabilidad civil", etiquetaBloque: "Seguro RC" },
    { id: "clausula", claves: ["clausula no repeticion", "no repeticion", "clausula"], contiene: "clausula no repeticion", etiquetaBloque: "Clausula no repeticion" },
    { id: "art_nomina", claves: ["constancia art", "art con nomina", "certificado afiliacion", "art nomina"], contiene: "constancia art con nomina", etiquetaBloque: "ART nomina" },
    { id: "vida", claves: ["vida obligatorio", "decreto 1567", "seguro de vida"], contiene: "seguro de vida obligatorio", etiquetaBloque: "Seguro vida obligatorio" },
    { id: "entrega_epp", claves: ["entrega epp", "entrega de epp", "elementos de proteccion personal", "ropa de trabajo", "resolucion 299", "epp"], contiene: "entrega epp", etiquetaBloque: "Entrega EPP" }
  ];

  function normalizar(texto) {
    return (texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function similitudSimple(a, b) {
    const sa = new Set(normalizar(a).split(" ").filter(Boolean));
    const sb = new Set(normalizar(b).split(" ").filter(Boolean));
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter++;
    return inter / Math.max(sa.size, sb.size);
  }

  function reglaParaTexto(textoNormalizado) {
    let mejor = null;
    let mejorPuntaje = 0;
    for (const regla of reglas) {
      let puntaje = 0;
      for (const k of regla.claves) {
        const kn = normalizar(k);
        if (!kn) continue;
        if (textoNormalizado.includes(kn)) {
          puntaje += kn.split(" ").length;
        }
      }
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = regla;
      }
    }
    return mejorPuntaje > 0 ? mejor : null;
  }

  /**
   * sugerirRequerimiento — ahora acepta objetos de requerimiento con recurso.
   *
   * @param {string} nombreArchivo - Nombre del archivo PDF.
   * @param {Array<{nombre:string, recurso?:{apellido:string, nombre:string, cuil:string, contrato:string}}>} requerimientos
   *        Puede ser array de strings (retrocompatible) o array de objetos con nombre y recurso.
   * @param {Object} memoria - Patrones aprendidos.
   * @param {Object} [metadata] - Metadatos extraídos por OCR del contenido del PDF:
   *        { apellido, nombre, cuil, patente, periodo }
   * @returns {string|null} nombre del requerimiento sugerido, o null.
   */
  function sugerirRequerimiento(nombreArchivo, requerimientos, memoria, metadata) {
    const nom = normalizar(nombreArchivo);
    if (memoria && memoria[nom]) return memoria[nom];

    // Normalizar entrada: puede venir como array de strings o array de objetos.
    const reqObjs = requerimientos.map((r) =>
      typeof r === "string" ? { nombre: r, recurso: null } : r
    );
    const reqNombres = reqObjs.map((r) => r.nombre);

    for (const regla of reglas) {
      if (regla.claves.some((k) => nom.includes(normalizar(k)))) {
        const candidatos = reqObjs.filter((r) => normalizar(r.nombre).includes(normalizar(regla.contiene)));
        if (candidatos.length === 1) return candidatos[0].nombre;
        if (candidatos.length > 1 && metadata) {
          // Varios requerimientos con mismo tipo pero distinto Recurso → elegir por metadata.
          const conRecurso = elegirPorRecurso(candidatos, metadata);
          if (conRecurso) return conRecurso.nombre;
        }
        if (candidatos.length > 0) return candidatos[0].nombre;
      }
    }

    const patenteMatch = nom.match(/\b[a-z]{2,3}\d{3}\b|\b[a-z]{3}\d{3}\b/i);
    const patenteArchivo = patenteMatch ? patenteMatch[0].toLowerCase() : "";
    const patenteMeta = metadata?.patente ? metadata.patente.toLowerCase() : "";
    const patenteUsar = patenteArchivo || patenteMeta;
    if (patenteUsar) {
      const auto = reqObjs.find((r) => normalizar(r.nombre).includes(`automotor patente ${patenteUsar}`));
      if (auto) return auto.nombre;
      const tecnico = reqObjs.find((r) => normalizar(r.nombre).includes(`tecnico patente ${patenteUsar}`));
      if (tecnico) return tecnico.nombre;
    }

    // Si hay metadata de OCR (apellido/nombre/cuil), buscar requerimientos cuyo Recurso coincida.
    if (metadata && (metadata.apellido || metadata.cuil)) {
      const porRecurso = elegirPorRecursoYSimilitud(reqObjs, nombreArchivo, metadata);
      if (porRecurso) return porRecurso.nombre;
    }

    let mejor = null;
    let mejorScore = 0;
    for (const req of reqNombres) {
      const s = similitudSimple(nombreArchivo, req);
      if (s > mejorScore) {
        mejor = req;
        mejorScore = s;
      }
    }
    return mejorScore > 0.2 ? mejor : null;
  }

  /**
   * Entre varios requerimientos candidatos (mismo tipo), elige el que mejor
   * coincida con la metadata OCR del documento, comparando contra el Recurso.
   */
  function elegirPorRecurso(candidatos, metadata) {
    if (!metadata) return null;
    const metaApellido = normalizar(metadata.apellido || "");
    const metaNombre = normalizar(metadata.nombre || "");
    const metaCuil = (metadata.cuil || "").replace(/\D/g, "");

    let mejor = null;
    let mejorScore = 0;
    for (const c of candidatos) {
      if (!c.recurso) continue;
      let score = 0;
      const recApellido = normalizar(c.recurso.apellido || "");
      const recNombre = normalizar(c.recurso.nombre || "");
      const recCuil = (c.recurso.cuil || "").replace(/\D/g, "");
      // Coincidencia por CUIL (máxima prioridad).
      if (metaCuil && recCuil && metaCuil === recCuil) score += 10;
      // Coincidencia por apellido.
      if (metaApellido && recApellido && recApellido.includes(metaApellido)) score += 5;
      else if (metaApellido && recApellido && metaApellido.includes(recApellido)) score += 4;
      // Coincidencia por nombre.
      if (metaNombre && recNombre) {
        const palabrasNombre = metaNombre.split(/\s+/);
        for (const p of palabrasNombre) {
          if (p.length > 2 && recNombre.includes(p)) score += 2;
        }
      }
      if (score > mejorScore) {
        mejorScore = score;
        mejor = c;
      }
    }
    return mejorScore >= 4 ? mejor : null;
  }

  /**
   * Combina similitud del nombre del archivo con el requerimiento + coincidencia
   * de metadata contra Recurso. Útil cuando no hay match por reglas.
   */
  function elegirPorRecursoYSimilitud(reqObjs, nombreArchivo, metadata) {
    let mejor = null;
    let mejorScore = 0;

    for (const r of reqObjs) {
      if (!r.recurso) continue;
      let score = 0;
      // Similitud nombre archivo vs nombre requerimiento.
      const simNombre = similitudSimple(nombreArchivo, r.nombre);
      score += simNombre * 3;
      // Bonus por coincidencia de Recurso con metadata.
      const metaApellido = normalizar(metadata.apellido || "");
      const recApellido = normalizar(r.recurso.apellido || "");
      if (metaApellido && recApellido && (recApellido.includes(metaApellido) || metaApellido.includes(recApellido))) {
        score += 5;
      }
      const metaCuil = (metadata.cuil || "").replace(/\D/g, "");
      const recCuil = (r.recurso.cuil || "").replace(/\D/g, "");
      if (metaCuil && recCuil && metaCuil === recCuil) score += 8;
      if (score > mejorScore) {
        mejorScore = score;
        mejor = r;
      }
    }
    // Umbral: debe haber al menos algo de similitud de nombre + match de recurso.
    return mejorScore >= 5 ? mejor : null;
  }

  window.MAUMatcher = { sugerirRequerimiento, normalizar, similitudSimple, reglaParaTexto, reglas, elegirPorRecurso };
})();
