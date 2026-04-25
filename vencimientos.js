// vencimientos.js
// Colorea cada CELDA con fecha en la pantalla de Vencimientos.aspx como un semáforo,
// y muestra un badge flotante en las demás pantallas del sitio.
//
// - Vencido (ya pasó):            BORDÓ OSCURO
// - Esta semana (hasta domingo):  ROJO
// - Próxima semana:               AMARILLO
// - Este mes:                     VERDE
// - Más lejos:                    sin color

(function iniciarVencimientos() {
  const HOST_OK = location.hostname.includes("controldocumentario.com");
  if (!HOST_OK) return;

  const EN_VENCIMIENTOS = location.pathname.toLowerCase().includes("/vencimientos.aspx");

  // --- Utilidades de fecha -------------------------------------------------

  function parsearFechaAR(texto) {
    const t = String(texto || "").trim();
    // Solo fechas que ocupan TODA la celda (no textos largos que mencionan una fecha)
    const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (!m) return null;
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10) - 1;
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += 2000;
    if (dd < 1 || dd > 31 || mm < 0 || mm > 11 || yy < 2000 || yy > 2100) return null;
    const f = new Date(yy, mm, dd);
    if (isNaN(f.getTime())) return null;
    return f;
  }

  function limitesSemaforo() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diasHastaDom = (7 - hoy.getDay()) % 7;
    const finEstaSemana = new Date(hoy);
    finEstaSemana.setDate(hoy.getDate() + diasHastaDom);
    finEstaSemana.setHours(23, 59, 59, 999);
    const finProxSemana = new Date(finEstaSemana);
    finProxSemana.setDate(finEstaSemana.getDate() + 7);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
    return { hoy, finEstaSemana, finProxSemana, finMes };
  }

  function clasificarFecha(fecha) {
    const { hoy, finEstaSemana, finProxSemana, finMes } = limitesSemaforo();
    if (fecha < hoy) return "vencido";
    if (fecha <= finEstaSemana) return "estaSemana";
    if (fecha <= finProxSemana) return "proxSemana";
    if (fecha <= finMes) return "esteMes";
    return "futuro";
  }

  const COLORES = {
    vencido:    { bg: "#7a1111", fg: "#ffffff", label: "Vencido" },
    estaSemana: { bg: "#dc3545", fg: "#ffffff", label: "Esta semana" },
    proxSemana: { bg: "#f0ad4e", fg: "#212529", label: "Próxima semana" },
    esteMes:    { bg: "#28a745", fg: "#ffffff", label: "Este mes" },
    futuro:     { bg: "",        fg: "",        label: "Más adelante" }
  };

  // --- Coloreo de celdas en Vencimientos.aspx -----------------------------

  function colorearCeldas() {
    const conteos = { vencido: 0, estaSemana: 0, proxSemana: 0, esteMes: 0, futuro: 0 };
    const celdas = document.querySelectorAll("td");
    let algunaPintada = false;

    for (const c of celdas) {
      if (c.dataset.mauPintada === "1") continue; // ya pintada, saltar
      const f = parsearFechaAR(c.textContent);
      if (!f) continue;
      const cat = clasificarFecha(f);
      conteos[cat] = (conteos[cat] || 0) + 1;
      const col = COLORES[cat];
      if (col.bg) {
        c.style.setProperty("background-color", col.bg, "important");
        c.style.setProperty("color", col.fg, "important");
        c.style.setProperty("font-weight", "700", "important");
        c.dataset.mauPintada = "1";
        algunaPintada = true;
      }
    }
    return { conteos, algunaPintada };
  }

  function mostrarResumen(conteos) {
    const ID = "mau-resumen-venc";
    const existente = document.getElementById(ID);
    if (existente) existente.remove();

    // Ubicación: arriba de la primera tabla con fechas (o arriba del footer)
    const primera = document.querySelector("[data-mau-pintada], td[style*='background-color: rgb(122, 17, 17)'], td[style*='background-color: rgb(40, 167, 69)']");
    const ancla = primera ? primera.closest("table") : null;

    const div = document.createElement("div");
    div.id = ID;
    div.style.cssText = [
      "display:flex",
      "gap:8px",
      "flex-wrap:wrap",
      "align-items:center",
      "padding:12px 14px",
      "margin:14px 0",
      "background:#fff",
      "border:1px solid #e0e0e0",
      "border-radius:10px",
      "box-shadow:0 2px 6px rgba(0,0,0,0.06)",
      "font-family:system-ui,-apple-system,sans-serif",
      "font-size:14px",
      "color:#333"
    ].join(";");

    const pill = (label, count, color, textColor) => `
      <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:${color};color:${textColor};font-weight:600;">
        ${label}: ${count}
      </span>`;

    div.innerHTML = `
      <span style="font-weight:700;margin-right:6px;">Semáforo:</span>
      ${pill("Vencido",        conteos.vencido,    "#7a1111", "#fff")}
      ${pill("Esta semana",    conteos.estaSemana, "#dc3545", "#fff")}
      ${pill("Próxima semana", conteos.proxSemana, "#f0ad4e", "#332200")}
      ${pill("Este mes",       conteos.esteMes,    "#28a745", "#fff")}
    `;

    if (ancla && ancla.parentNode) {
      ancla.parentNode.insertBefore(div, ancla);
    } else {
      // fallback: arriba del body
      document.body.insertBefore(div, document.body.firstChild);
    }
  }

  function aplicarEnVencimientos() {
    const { conteos, algunaPintada } = colorearCeldas();
    const totalMarcado = conteos.vencido + conteos.estaSemana + conteos.proxSemana + conteos.esteMes;
    if (algunaPintada || totalMarcado > 0) {
      mostrarResumen(conteos);
    }
    return algunaPintada;
  }

  function observarCambiosTabla() {
    let timeout = null;
    const obs = new MutationObserver(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => aplicarEnVencimientos(), 350);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- Badge flotante en otras pantallas ----------------------------------

  function crearBadge(conteos) {
    const ID = "mau-badge-venc";
    const existente = document.getElementById(ID);
    if (existente) existente.remove();

    const urgente = (conteos.vencido || 0) + (conteos.estaSemana || 0) > 0;

    const div = document.createElement("div");
    div.id = ID;
    div.title = "Click para ir a Vencimientos";
    div.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "left:20px",
      "z-index:2147483646",
      "background:#fff",
      "border:1px solid #e0e0e0",
      "border-radius:12px",
      "box-shadow:0 6px 18px rgba(0,0,0,0.18)",
      "padding:10px 14px",
      "font-family:system-ui,-apple-system,sans-serif",
      "font-size:13px",
      "color:#333",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "gap:10px",
      urgente ? "animation:mau-pulse 1.6s infinite;" : ""
    ].join(";");

    const dot = (color) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>`;

    div.innerHTML = `
      <strong style="margin-right:4px;">Vencimientos</strong>
      ${dot("#7a1111")} <span>${conteos.vencido || 0}</span>
      ${dot("#dc3545")} <span>${conteos.estaSemana || 0}</span>
      ${dot("#f0ad4e")} <span>${conteos.proxSemana || 0}</span>
      ${dot("#28a745")} <span>${conteos.esteMes || 0}</span>
      <span style="color:#999;margin-left:4px;" data-mau-cerrar="1">✕</span>
    `;

    div.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-mau-cerrar") === "1") {
        div.remove();
        e.stopPropagation();
        return;
      }
      location.href = "/Vencimientos.aspx?menu=11";
    });

    if (!document.getElementById("mau-badge-style")) {
      const s = document.createElement("style");
      s.id = "mau-badge-style";
      s.textContent = `@keyframes mau-pulse { 0%,100% { box-shadow:0 6px 18px rgba(220,53,69,0.25); } 50% { box-shadow:0 6px 22px rgba(220,53,69,0.65); } }`;
      document.head.appendChild(s);
    }

    document.body.appendChild(div);
  }

  async function calcularConteosDesdeRed() {
    // Intentamos traer la página de Vencimientos, pero el ASP.NET normalmente
    // necesita postback para ver datos. Si el GET no devuelve filas, devolvemos null.
    try {
      const resp = await fetch("/Vencimientos.aspx?menu=11", { credentials: "same-origin" });
      if (!resp.ok) return null;
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const celdas = doc.querySelectorAll("td");
      const conteos = { vencido: 0, estaSemana: 0, proxSemana: 0, esteMes: 0, futuro: 0 };
      for (const c of celdas) {
        const f = parsearFechaAR(c.textContent);
        if (!f) continue;
        conteos[clasificarFecha(f)]++;
      }
      const total = conteos.vencido + conteos.estaSemana + conteos.proxSemana + conteos.esteMes;
      if (total === 0) return null;
      return conteos;
    } catch (_e) {
      return null;
    }
  }

  async function mostrarBadgeEnOtrasPantallas() {
    const conteos = await calcularConteosDesdeRed();
    if (!conteos) return;
    crearBadge(conteos);
  }

  // --- Arranque ------------------------------------------------------------

  function arrancar() {
    if (EN_VENCIMIENTOS) {
      aplicarEnVencimientos();
      observarCambiosTabla(); // reintenta cuando hay postback y cambia la tabla
    } else {
      mostrarBadgeEnOtrasPantallas();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }
})();
