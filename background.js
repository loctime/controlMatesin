chrome.runtime.onInstalled.addListener(() => {
  console.log("DocAutomatización instalado correctamente.");
});

const KEY_MAPEOS = "matesin_mapeos_aprendidos";
const KEY_PATRONES_SABANA = "matesin_patrones_sabana";
const KEY_API_KEY = "matesin_anthropic_api_key";
const KEY_MODELO = "matesin_anthropic_modelo";

const KEY_CD_USER = "matesin_cd_user";
const KEY_CD_PASS = "matesin_cd_pass";

const KEY_TG_TOKEN = "matesin_tg_token";
const KEY_TG_CHATID = "matesin_tg_chatid";
const KEY_TG_DIAS = "matesin_tg_dias"; // legacy
const KEY_TG_DIAS_PERSONAL = "matesin_tg_dias_personal";
const KEY_TG_DIAS_VEHICULOS = "matesin_tg_dias_vehiculos";
const KEY_TG_FRECUENCIA = "matesin_tg_frecuencia";
const KEY_TG_ACTIVO = "matesin_tg_activo";
const KEY_TG_SILENCIO_DESDE = "matesin_tg_silencio_desde";
const KEY_TG_SILENCIO_HASTA = "matesin_tg_silencio_hasta";
const KEY_TG_ULTIMO_HASH = "matesin_tg_ultimo_hash";
const KEY_TG_UPDATE_OFFSET = "matesin_tg_update_offset";

const ALARMA_TG = "matesin_alarma_telegram";
const ALARMA_TG_POLL = "matesin_alarma_tg_poll";

// Tope práctico para descarga de archivos por Bot API de Telegram (~20 MB).
const TG_MAX_PDF_BYTES = 20 * 1024 * 1024;

const MODELO_DEFAULT = "claude-haiku-4-5-20251001";

const TIPOS_DOCUMENTO = [
  { id: "f931", etiqueta: "931", desc: "Formulario ARCA 931 — tiene el logo de ARCA y un recuadro grande con el número '931' impreso. Dice 'Declaración Jurada en Pesos con centavos S.U.S.S.' Tiene tablas con secciones 'I - REGIMEN NACIONAL DE SEGURIDAD SOCIAL', 'II - REGIMEN NACIONAL DE OBRAS SOCIALES', 'VI - LEY DE RIESGOS DE TRABAJO', 'VIII - MONTOS QUE SE INGRESAN'. Es el formulario de declaración jurada, NO un ticket de banco." },
  { id: "nomina_f931", etiqueta: "Nomina 931", desc: "Nómina del F 931: listado de empleados asociados al F931 (tabla con nombres/CUILes de la declaración)" },
  { id: "acuse_f931", etiqueta: "Pago de 931", desc: "Acuse de recibo DJ ARCA / comprobante de presentación del F931 (Presentación DJ por Internet)" },
  { id: "vep_f931", etiqueta: "Pago de 931", desc: "VEP (Volante Electrónico de Pago) del F931 / SICOSS saldo DJ empleadores" },
  { id: "pago_f931", etiqueta: "Pago de 931", desc: "Comprobante Banco Provincia — título 'Pago' + 'Operación realizada con éxito' + 'Número de VEP'. SEÑAL DEFINITIVA: lista impuestos de seguridad social con códigos 351 (CONTRIBUCIONES SEG. SOCIAL), 301 (EMPLEADOR-APORTES SEG. SOCIAL), 352 (CONTRIBUCIONES OBRA SOCIAL), 302 (APORTES OBRAS SOCIALES), 312 (ASEG.RIESGO DE TRABAJO / ART), 28 (SEGURO DE VIDA COLECTIVO). Estos códigos son inconfundibles. No tiene 'Nueva transferencia' ni 'VAR f.Desempleo' ni 'Ente Abonado: UOCRA'." },
  { id: "boleta_uocra", etiqueta: "Pago de aportes sindicales", desc: "Boleta de depósito UOCRA (aporte cuota sindical, FCS, fondo cese laboral)" },
  { id: "dj_uocra", etiqueta: "Pago de aportes sindicales", desc: "Comprobante de Presentación de Declaración Jurada Nominativa UOCRA" },
  { id: "pago_uocra", etiqueta: "Pago de aportes sindicales", desc: "Comprobante Banco Provincia — título 'Pago' + 'Operación realizada con éxito'. SEÑAL DEFINITIVA: dice 'Nombre del Ente Abonado: UOCRA' (o 'UOCRA - Online'). Ningún otro ticket de pago tiene este campo con UOCRA. No tiene los códigos de impuestos 351/301/352 del pago_f931." },
  { id: "vep_autonomo", etiqueta: "Desestimar", desc: "VEP Autónomo / pago de monotributo o autónomos (NO se sube, se desestima)" },
  { id: "pago_autonomo", etiqueta: "Desestimar", desc: "Comprobante Banco Provincia del pago de autónomos (NO se sube, se desestima)" },
  { id: "recibo_haberes", etiqueta: "Pago de haberes", desc: "Recibo de sueldo / haberes de un empleado (UOCRA, hay apellido/nombre y CUIL del empleado, quincena y conceptos como hs trabajadas, jubilación, ley 19032, sindical)" },
  { id: "transferencia_desempleo", etiqueta: "Fondo de desempleo", desc: "Comprobante Banco Provincia — el TÍTULO de la página dice 'Nueva transferencia' (no 'Pago'). Tiene 'Titular cuenta destino' (el empleado receptor), y el campo Referencia dice 'VAR f.Desempleo'. Este título 'Nueva transferencia' lo distingue claramente de pago_f931 que dice 'Pago'. El 'f.' en 'f.Desempleo' significa 'fondo', no 'formulario 931'." },
  { id: "seguro_rc_pago", etiqueta: "Pago seguro responsabilidad civil", desc: "Pago / recibo del seguro de responsabilidad civil (una sola hoja)" },
  { id: "seguro_automotor_pago", etiqueta: "Pago seguro automotor", desc: "Pago de seguro de automotor / seguro técnico del vehículo — contiene PATENTE del vehículo. Este documento se usa tanto para Pago seguro automotor como Pago seguro técnico" },
  { id: "clausula_no_repeticion", etiqueta: "Clausula no repeticion", desc: "Cláusula de no repetición de seguro" },
  { id: "art_nomina", etiqueta: "Constancia ART con nomina", desc: "Constancia de ART con nómina de personal cubierto" },
  { id: "vida_obligatorio", etiqueta: "Seguro de vida obligatorio", desc: "Seguro de vida obligatorio decreto 1567" },
  { id: "entrega_epp", etiqueta: "Entrega EPP", desc: "Planilla de entrega de ropa de trabajo y elementos de protección personal (EPP) — Resolución 299/11 Anexo I. Contiene lista de productos (casco, botines, guantes, lentes, pantalón, camisa, chaleco, tapones auditivos, etc.), fechas de entrega y firma del trabajador. El nombre del trabajador aparece en el campo 'Nombre y Apellido del Trabajador'." },
  { id: "capacitacion", etiqueta: "Capacitacion", desc: "Planilla de asistencia o constancia de capacitación" },
  { id: "grua", etiqueta: "Credencial op. gruas", desc: "Credencial de operador de grúa" },
  { id: "desconocido", etiqueta: "", desc: "No coincide con ninguno de los tipos anteriores" }
];

function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

chrome.runtime.onMessage.addListener((mensaje, _sender, sendResponse) => {
  manejarMensaje(mensaje)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function manejarMensaje(mensaje) {
  const accion = mensaje?.action;
  if (!accion) throw new Error("Mensaje sin acción.");

  if (accion === "storage:getMemory") {
    const data = await chrome.storage.local.get(KEY_MAPEOS);
    return data[KEY_MAPEOS] || {};
  }

  if (accion === "storage:setMemory") {
    const memoria = mensaje?.payload || {};
    await chrome.storage.local.set({ [KEY_MAPEOS]: memoria });
    return { saved: true };
  }

  if (accion === "storage:learnPattern") {
    const nombreArchivo = mensaje?.payload?.nombreArchivo || "";
    const requerimiento = mensaje?.payload?.requerimiento || "";
    if (!nombreArchivo || !requerimiento) throw new Error("Faltan datos para aprender patrón.");
    const data = await chrome.storage.local.get(KEY_MAPEOS);
    const memoria = data[KEY_MAPEOS] || {};
    memoria[normalizar(nombreArchivo)] = requerimiento;
    await chrome.storage.local.set({ [KEY_MAPEOS]: memoria });
    return { saved: true };
  }

  if (accion === "storage:clearMemory") {
    await chrome.storage.local.set({ [KEY_MAPEOS]: {} });
    return { cleared: true };
  }

  if (accion === "storage:leerPatronesSabana") {
    const data = await chrome.storage.local.get(KEY_PATRONES_SABANA);
    return data[KEY_PATRONES_SABANA] || [];
  }

  if (accion === "storage:guardarPatronSabana") {
    const payload = mensaje?.payload || {};
    const nombre = String(payload.nombre || "").trim();
    const bloques = payload.bloques;
    const firma = payload.firma;
    const bloquesModal = payload.bloquesModal;
    const firmaTipos = payload.firmaTipos;
    if (!nombre) throw new Error("Falta el nombre del patrón.");
    const tieneViejo = Array.isArray(bloques) && Array.isArray(firma);
    const tieneNuevo = Array.isArray(bloquesModal) && Array.isArray(firmaTipos);
    if (!tieneViejo && !tieneNuevo) throw new Error("Patrón inválido.");
    const data = await chrome.storage.local.get(KEY_PATRONES_SABANA);
    const arr = data[KEY_PATRONES_SABANA] || [];
    const idx = arr.findIndex((p) => p.nombre === nombre);
    const entry = { nombre, updatedAt: Date.now() };
    if (tieneViejo) { entry.bloques = bloques; entry.firma = firma; }
    if (tieneNuevo) {
      entry.bloquesModal = bloquesModal;
      entry.firmaTipos = firmaTipos;
      if (payload.totalPaginas != null) entry.totalPaginas = payload.totalPaginas;
    }
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    await chrome.storage.local.set({ [KEY_PATRONES_SABANA]: arr });
    return { saved: true };
  }

  if (accion === "storage:guardarPatronesSabana") {
    const lista = mensaje?.payload;
    if (!Array.isArray(lista)) throw new Error("Se esperaba un array de patrones.");
    await chrome.storage.local.set({ [KEY_PATRONES_SABANA]: lista });
    return { saved: true };
  }

  if (accion === "storage:limpiarPatronesSabana") {
    await chrome.storage.local.set({ [KEY_PATRONES_SABANA]: [] });
    return { cleared: true };
  }

  if (accion === "storage:exportarMapeo") {
    const data = await chrome.storage.local.get([KEY_PATRONES_SABANA, KEY_MAPEOS]);
    return {
      version: 1,
      exportadoEl: new Date().toISOString(),
      patrones_sabana: data[KEY_PATRONES_SABANA] || [],
      mapeos_aprendidos: data[KEY_MAPEOS] || {}
    };
  }

  if (accion === "storage:importarMapeo") {
    const payload = mensaje?.payload || {};
    if (!payload.patrones_sabana && !payload.mapeos_aprendidos) throw new Error("Archivo inválido.");
    const toSave = {};
    if (Array.isArray(payload.patrones_sabana)) toSave[KEY_PATRONES_SABANA] = payload.patrones_sabana;
    if (payload.mapeos_aprendidos && typeof payload.mapeos_aprendidos === "object") toSave[KEY_MAPEOS] = payload.mapeos_aprendidos;
    await chrome.storage.local.set(toSave);
    return {
      patrones: (payload.patrones_sabana || []).length,
      mapeos: Object.keys(payload.mapeos_aprendidos || {}).length
    };
  }

  if (accion === "storage:getApiKey") {
    const data = await chrome.storage.local.get([KEY_API_KEY, KEY_MODELO]);
    return {
      apiKey: data[KEY_API_KEY] || "",
      modelo: data[KEY_MODELO] || MODELO_DEFAULT
    };
  }

  if (accion === "storage:setApiKey") {
    const apiKey = String(mensaje?.payload?.apiKey || "").trim();
    const modelo = String(mensaje?.payload?.modelo || MODELO_DEFAULT).trim();
    await chrome.storage.local.set({ [KEY_API_KEY]: apiKey, [KEY_MODELO]: modelo });
    return { saved: true };
  }

  if (accion === "ai:clasificarPagina") {
    const base64 = mensaje?.payload?.base64;
    const mediaType = mensaje?.payload?.mediaType || "image/jpeg";
    if (!base64) throw new Error("Falta imagen base64.");
    return await clasificarPaginaConClaude(base64, mediaType);
  }

  if (accion === "ai:matchearConMapeo") {
    const paginasClasificadas = mensaje?.payload?.paginasClasificadas;
    if (!Array.isArray(paginasClasificadas)) throw new Error("Falta paginasClasificadas.");
    const dataMapeo = await chrome.storage.local.get(KEY_PATRONES_SABANA);
    const patrones = (dataMapeo[KEY_PATRONES_SABANA] || []).filter((p) =>
      Array.isArray(p.firmaTipos) && Array.isArray(p.bloquesModal) && p.bloquesModal.length
    );
    if (!patrones.length) return null;
    return await tgMatchearPatronConClaude(paginasClasificadas, patrones);
  }

  if (accion === "ai:compararConReferencia") {
    const { nuevasPaginas, referencia } = mensaje?.payload || {};
    if (!Array.isArray(nuevasPaginas) || !referencia) throw new Error("Faltan datos para comparar.");
    return await compararPaginasConReferencia(nuevasPaginas, referencia);
  }

  if (accion === "ai:probarConexion") {
    return await probarConexionClaude();
  }

  if (accion === "auth:getCreds") {
    const data = await chrome.storage.local.get([KEY_CD_USER, KEY_CD_PASS]);
    return {
      user: data[KEY_CD_USER] || "",
      pass: data[KEY_CD_PASS] || ""
    };
  }

  if (accion === "auth:setCreds") {
    const user = String(mensaje?.payload?.user || "").trim();
    const pass = String(mensaje?.payload?.pass || "");
    await chrome.storage.local.set({ [KEY_CD_USER]: user, [KEY_CD_PASS]: pass });
    return { saved: true };
  }

  if (accion === "auth:probarLogin") {
    const r = await cdReLogin({ visible: false });
    if (!r.ok) throw new Error(r.motivo || "No se pudo loguear.");
    return { ok: true };
  }

  if (accion === "tg:getConfig") {
    return await tgGetConfig();
  }

  if (accion === "tg:setConfig") {
    const p = mensaje?.payload || {};
    await tgSetConfig(p);
    await tgReprogramarAlarma();
    // Registrar comandos para que aparezcan con la barra en Telegram.
    try {
      const cfg = await tgGetConfig();
      if (cfg.token) await tgRegistrarComandos(cfg.token);
    } catch (e) {
      console.warn("[MAU] No se pudieron registrar los comandos:", e);
    }
    return { saved: true };
  }

  if (accion === "tg:probar") {
    const cfg = await tgGetConfig();
    if (!cfg.token || !cfg.chatId) throw new Error("Falta token o Chat ID.");
    const texto = "✅ Prueba de DocAutomatización — el bot está conectado.";
    await tgEnviarMensaje(cfg.token, cfg.chatId, texto);
    return { enviado: true };
  }

  if (accion === "tg:chequearAhora") {
    const res = await tgChequearYAvisar({ forzarEnvio: true });
    return res;
  }

  if (accion === "tg:chequearVisible") {
    const res = await tgChequearYAvisar({ forzarEnvio: true, visible: true });
    return res;
  }

  throw new Error(`Acción no soportada: ${accion}`);
}

// ===================== LOGIN AUTO =====================

/**
 * Intenta iniciar sesión en controldocumentario.com/Login.aspx
 * usando el usuario y contraseña guardados en Opciones.
 *
 * Abre Login.aspx en pestaña (oculta por defecto), busca el primer
 * input de texto visible (usuario), el primer input tipo password
 * (contraseña) y el botón/submit con texto "INGRESAR", lo clickea y
 * espera a que el sitio redirija fuera de Login.aspx (= login OK).
 *
 * Devuelve { ok: true } si el login fue exitoso,
 * o { ok: false, motivo: "..." } si falló (sin credenciales, timeout,
 * credenciales incorrectas, etc.).
 */
async function cdReLogin({ visible = false } = {}) {
  const creds = await chrome.storage.local.get([KEY_CD_USER, KEY_CD_PASS]);
  const user = creds[KEY_CD_USER] || "";
  const pass = creds[KEY_CD_PASS] || "";
  if (!user || !pass) {
    return { ok: false, motivo: "No hay usuario/contraseña guardados en Opciones." };
  }

  const url = "https://controldocumentario.com/Login.aspx";
  const tab = await chrome.tabs.create({ url, active: !!visible });
  const tabId = tab.id;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  const esperarCargaTab = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handler);
      reject(new Error("Timeout cargando login"));
    }, 30000);
    function handler(updId, info) {
      if (updId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handler);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(handler);
  });

  try {
    await esperarCargaTab();
    await dormir(1500);

    // 1) Rellenar campos y disparar el submit
    const [{ result: intentoLogin } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (usuario, clave) => {
        function esVisible(el) {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = window.getComputedStyle(el);
          return cs.visibility !== "hidden" && cs.display !== "none";
        }
        function dispararEventos(el) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Buscar input de texto visible (primer text/email sin tipo password)
        const inputsTexto = Array.from(document.querySelectorAll('input'))
          .filter(i => {
            const t = (i.type || "text").toLowerCase();
            return (t === "text" || t === "email" || t === "" ) && esVisible(i);
          });
        const inputUser = inputsTexto[0];

        const inputPass = Array.from(document.querySelectorAll('input[type="password"]'))
          .find(esVisible);

        if (!inputUser || !inputPass) {
          return { rellenado: false, motivo: "No encontré los campos de usuario/contraseña." };
        }

        inputUser.focus();
        inputUser.value = usuario;
        dispararEventos(inputUser);

        inputPass.focus();
        inputPass.value = clave;
        dispararEventos(inputPass);

        // Buscar el botón INGRESAR (input submit, button o anchor con texto INGRESAR)
        const candidatos = [
          ...document.querySelectorAll('input[type="submit"]'),
          ...document.querySelectorAll('input[type="button"]'),
          ...document.querySelectorAll('button'),
          ...document.querySelectorAll('a')
        ].filter(esVisible);

        // Preferir el que diga "INGRESAR"; excluir los de Microsoft / Autogestión / Soy nuevo / Olvidó
        const malos = ["microsoft", "autogestion", "autogestión", "soy nuevo", "olvido", "olvidó"];
        const esMalo = (t) => malos.some(m => t.includes(m));

        let btn = candidatos.find(b => {
          const t = (b.value || b.textContent || "").toLowerCase().trim();
          return t.includes("ingresar") && !esMalo(t);
        });

        // Si no, cualquier submit que no sea malo
        if (!btn) {
          btn = candidatos.find(b => {
            const t = (b.value || b.textContent || "").toLowerCase().trim();
            return (b.type === "submit" || b.tagName === "BUTTON") && !esMalo(t);
          });
        }

        if (!btn) {
          // Último recurso: submit del form de los inputs
          const form = inputPass.form || inputUser.form;
          if (form) {
            try { form.submit(); return { rellenado: true, submitForm: true }; } catch (e) {}
          }
          return { rellenado: false, motivo: "No encontré el botón INGRESAR." };
        }

        btn.click();
        return { rellenado: true, botonTexto: (btn.value || btn.textContent || "").trim() };
      },
      args: [user, pass]
    });

    if (!intentoLogin?.rellenado) {
      return { ok: false, motivo: intentoLogin?.motivo || "No se pudo completar el formulario." };
    }

    // 2) Esperar la redirección. Login OK = la URL ya no contiene "login".
    const inicio = Date.now();
    while (Date.now() - inicio < 20000) {
      await dormir(1000);
      try {
        const t = await chrome.tabs.get(tabId);
        const urlActual = (t.url || "").toLowerCase();
        if (!urlActual.includes("login")) {
          // Login OK
          return { ok: true };
        }
        // Detectar mensaje de error en la pantalla (credenciales incorrectas, etc.)
        const [{ result: tieneError } = {}] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const texto = (document.body.innerText || "").toLowerCase();
            return /incorrect|inv[aá]lid|err[oó]r|usuario o contrase/.test(texto);
          }
        }).catch(() => [{}]);
        if (tieneError) {
          return { ok: false, motivo: "Usuario o contraseña incorrectos." };
        }
      } catch (e) {
        // La pestaña podría haberse cerrado — seguir intentando
      }
    }
    return { ok: false, motivo: "Timeout esperando respuesta del login." };
  } finally {
    if (!visible) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

// ===================== TELEGRAM =====================

async function tgGetConfig() {
  const data = await chrome.storage.local.get([
    KEY_TG_TOKEN, KEY_TG_CHATID, KEY_TG_DIAS, KEY_TG_DIAS_PERSONAL, KEY_TG_DIAS_VEHICULOS,
    KEY_TG_FRECUENCIA, KEY_TG_ACTIVO, KEY_TG_SILENCIO_DESDE, KEY_TG_SILENCIO_HASTA
  ]);
  const diasLegacy = typeof data[KEY_TG_DIAS] === "number" ? data[KEY_TG_DIAS] : 7;
  return {
    token: data[KEY_TG_TOKEN] || "",
    chatId: data[KEY_TG_CHATID] || "",
    dias: diasLegacy,
    diasPersonal: typeof data[KEY_TG_DIAS_PERSONAL] === "number" ? data[KEY_TG_DIAS_PERSONAL] : diasLegacy,
    diasVehiculos: typeof data[KEY_TG_DIAS_VEHICULOS] === "number" ? data[KEY_TG_DIAS_VEHICULOS] : 15,
    frecuencia: typeof data[KEY_TG_FRECUENCIA] === "number" ? data[KEY_TG_FRECUENCIA] : 180,
    activo: !!data[KEY_TG_ACTIVO],
    silencioDesde: data[KEY_TG_SILENCIO_DESDE] || "22:00",
    silencioHasta: data[KEY_TG_SILENCIO_HASTA] || "08:00"
  };
}

async function tgSetConfig(p) {
  const token = String(p.token || "").trim();
  const chatId = String(p.chatId || "").trim();
  const diasPersonal = Math.max(1, Math.min(60, parseInt(p.diasPersonal, 10) || 7));
  const diasVehiculos = Math.max(1, Math.min(60, parseInt(p.diasVehiculos, 10) || 15));
  const frecuencia = Math.max(30, parseInt(p.frecuencia, 10) || 180);
  const activo = !!p.activo;
  const silencioDesde = String(p.silencioDesde || "").trim();
  const silencioHasta = String(p.silencioHasta || "").trim();
  await chrome.storage.local.set({
    [KEY_TG_TOKEN]: token,
    [KEY_TG_CHATID]: chatId,
    [KEY_TG_DIAS_PERSONAL]: diasPersonal,
    [KEY_TG_DIAS_VEHICULOS]: diasVehiculos,
    [KEY_TG_FRECUENCIA]: frecuencia,
    [KEY_TG_ACTIVO]: activo,
    [KEY_TG_SILENCIO_DESDE]: silencioDesde,
    [KEY_TG_SILENCIO_HASTA]: silencioHasta
  });
}

/**
 * Devuelve true si la hora actual está dentro del rango de silencio.
 * Soporta rangos que cruzan medianoche (ej: 22:00 → 08:00).
 */
function tgEnSilencio(silencioDesde, silencioHasta, ahora) {
  if (!silencioDesde || !silencioHasta) return false;
  if (silencioDesde === silencioHasta) return false; // apagado
  const [hD, mD] = silencioDesde.split(":").map(n => parseInt(n, 10));
  const [hH, mH] = silencioHasta.split(":").map(n => parseInt(n, 10));
  if ([hD, mD, hH, mH].some(n => isNaN(n))) return false;
  const minDesde = hD * 60 + mD;
  const minHasta = hH * 60 + mH;
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  if (minDesde < minHasta) {
    // rango dentro del mismo día (ej: 12:00 → 14:00)
    return minAhora >= minDesde && minAhora < minHasta;
  } else {
    // rango cruza medianoche (ej: 22:00 → 08:00)
    return minAhora >= minDesde || minAhora < minHasta;
  }
}

async function tgRegistrarComandos(token) {
  const comandos = [
    { command: "chequear", description: "Resumen de vencimientos ahora" },
    { command: "ayuda", description: "Muestra los comandos disponibles" }
  ];
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/setMyCommands`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commands: comandos })
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`setMyCommands ${resp.status}: ${err.slice(0, 200)}`);
  }
  return await resp.json();
}

async function tgEnviarMensaje(token, chatId, texto) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  // Telegram limita a 4096 chars por mensaje. Partimos a 3800 para dejar margen.
  const trozos = tgPartirMensaje(String(texto || ""), 3800);
  let ultimo = null;
  for (const trozo of trozos) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: trozo,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Telegram ${resp.status}: ${err.slice(0, 200)}`);
    }
    ultimo = await resp.json();
    // Pequeña pausa entre envíos para no pegarle al rate limit
    if (trozos.length > 1) await new Promise(r => setTimeout(r, 350));
  }
  return ultimo;
}

async function tgReprogramarAlarma() {
  const cfg = await tgGetConfig();
  try { await chrome.alarms.clear(ALARMA_TG); } catch {}
  try { await chrome.alarms.clear(ALARMA_TG_POLL); } catch {}
  if (cfg.activo && cfg.token && cfg.chatId) {
    chrome.alarms.create(ALARMA_TG, {
      delayInMinutes: 1,
      periodInMinutes: cfg.frecuencia
    });
    // Poll de comandos del usuario (cada 1 min)
    chrome.alarms.create(ALARMA_TG_POLL, {
      delayInMinutes: 0.2,
      periodInMinutes: 1
    });
    console.log(`[MAU] Alarma Telegram programada cada ${cfg.frecuencia} min. Poll de comandos cada 1 min.`);
  } else {
    console.log("[MAU] Alarma Telegram apagada.");
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMA_TG) {
    try {
      const cfg = await tgGetConfig();
      if (tgEnSilencio(cfg.silencioDesde, cfg.silencioHasta, new Date())) {
        console.log(`[MAU] Silencio activo (${cfg.silencioDesde}-${cfg.silencioHasta}). No mando alerta.`);
        return;
      }
      await tgChequearYAvisar({ forzarEnvio: false });
    } catch (e) {
      console.warn("[MAU] Error en chequeo automático:", e);
    }
  }
  if (alarm.name === ALARMA_TG_POLL) {
    try {
      await tgProcesarComandos();
    } catch (e) {
      console.warn("[MAU] Error leyendo comandos:", e);
    }
  }
});

/**
 * Lee los mensajes nuevos que te mandaron al bot y si hay un comando
 * reconocido lo ejecuta. Ignora mensajes de chats distintos al configurado.
 */
async function tgProcesarComandos() {
  const cfg = await tgGetConfig();
  if (!cfg.activo || !cfg.token || !cfg.chatId) return;

  const data = await chrome.storage.local.get(KEY_TG_UPDATE_OFFSET);
  const offset = typeof data[KEY_TG_UPDATE_OFFSET] === "number" ? data[KEY_TG_UPDATE_OFFSET] : 0;

  const url = `https://api.telegram.org/bot${encodeURIComponent(cfg.token)}/getUpdates?timeout=0&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`;
  const resp = await fetch(url);
  if (!resp.ok) return;
  const json = await resp.json();
  const updates = json?.result || [];
  if (!updates.length) return;

  // Si es la primera vez (offset 0), no procesar mensajes viejos — solo guardar el offset.
  if (offset === 0) {
    const ultimo = updates[updates.length - 1].update_id + 1;
    await chrome.storage.local.set({ [KEY_TG_UPDATE_OFFSET]: ultimo });
    return;
  }

  // Guardar el offset ANTES de procesar, así si el service worker muere a mitad
  // del chequeo, no re-procesamos el mismo comando dos veces.
  const nuevoOffset = updates[updates.length - 1].update_id + 1;
  await chrome.storage.local.set({ [KEY_TG_UPDATE_OFFSET]: nuevoOffset });

  for (const upd of updates) {
    const mensaje = upd.message;
    if (!mensaje || !mensaje.chat || String(mensaje.chat.id) !== String(cfg.chatId)) continue;

    // ¿Es un documento (PDF) adjunto?
    if (mensaje.document && /pdf/i.test(mensaje.document.mime_type || mensaje.document.file_name || "")) {
      try {
        await tgManejarDocumento(cfg, mensaje.document);
      } catch (e) {
        console.warn("[MAU] Error procesando documento:", e);
        try { await tgEnviarMensaje(cfg.token, cfg.chatId, `❌ Error procesando el PDF: ${e.message || e}`); } catch {}
      }
      continue;
    }

    // Si no, comando de texto
    const texto = String(mensaje.text || "").trim().toLowerCase();
    await tgManejarComando(cfg, texto);
  }
}

async function tgManejarComando(cfg, texto) {
  if (!texto) return;
  const limpio = texto.replace(/^\//, "").trim();

  // Confirmar / cancelar subida de sábana pendiente
  if (limpio === "si" || limpio === "sí" || limpio === "dale" || limpio === "ok") {
    try {
      // Primero intentar confirmar subida de documento; si no hay, intentar sábana
      const manejadoComoDoc = await tgConfirmarSubidaDoc(cfg);
      if (!manejadoComoDoc) {
        await tgConfirmarSubidaSabana(cfg);
      }
    } catch (e) {
      await tgEnviarMensaje(cfg.token, cfg.chatId, `❌ Error en la subida: ${escapeHtml(e.message || String(e))}`);
    }
    return;
  }
  if (limpio === "no" || limpio === "cancelar") {
    try {
      const data = await chrome.storage.local.get("matesin_tg_pendiente_sabana");
      if (data.matesin_tg_pendiente_sabana) {
        await chrome.storage.local.remove("matesin_tg_pendiente_sabana");
        await tgEnviarMensaje(cfg.token, cfg.chatId, "❌ Subida cancelada. La sábana pendiente fue descartada.");
      } else {
        await tgEnviarMensaje(cfg.token, cfg.chatId, "ℹ️ No había ninguna sábana pendiente.");
      }
    } catch {}
    return;
  }

  if (limpio === "chequear" || limpio === "check" || limpio === "ahora" ||
      limpio === "vencimientos" || limpio === "vencer" || limpio === "revisar") {
    try {
      await tgEnviarMensaje(cfg.token, cfg.chatId, "🔎 Chequeando vencimientos, dame unos segundos…");
      const res = await tgChequearYAvisar({ forzarEnvio: true });
      // Sólo mostrar mensaje extra si NO se envió, NO se salteó por lock y hay algo que decir.
      if (!res.enviado && !res.skipped && res.mensaje) {
        await tgEnviarMensaje(cfg.token, cfg.chatId, `ℹ️ ${res.mensaje}`);
      } else if (res.skipped) {
        await tgEnviarMensaje(cfg.token, cfg.chatId, "⏳ Ya hay un chequeo corriendo, esperá unos segundos.");
      }
    } catch (e) {
      await tgEnviarMensaje(cfg.token, cfg.chatId, `❌ Error: ${e.message || e}`);
    }
    return;
  }
  if (limpio === "help" || limpio === "ayuda" || limpio === "start" || limpio === "comandos") {
    const ayuda = [
      "<b>Comandos disponibles:</b>",
      "• <b>/chequear</b> — te manda el resumen de vencimientos ahora.",
      "• <b>/ayuda</b> — muestra este mensaje.",
      "",
      "También podés escribir sin la barra: <i>chequear</i>, <i>ahora</i>, <i>vencimientos</i>."
    ].join("\n");
    await tgEnviarMensaje(cfg.token, cfg.chatId, ayuda);
    return;
  }
}

chrome.runtime.onStartup.addListener(() => { tgReprogramarAlarma().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { tgReprogramarAlarma().catch(() => {}); });

/**
 * Abre Vencimientos.aspx, selecciona "Personal" en el dropdown, lee la tabla,
 * después selecciona "Máquinas" y lee otra vez. Devuelve los items de los dos.
 *
 * Cada item: { tipo: "personal"|"vehiculo", nombre, columna, fecha, diasFaltantes }.
 * Sólo se devuelven los que vencen en `umbralDias` o menos (incluye los ya vencidos).
 * Las filas con Estado = "Inhabilitado" se ignoran.
 */
async function tgExtraerVencimientosDesdeTab(umbralDias, _ignorado, visible = false) {
  const url = "https://controldocumentario.com/Vencimientos.aspx?menu=11";

  // 1) Si ya hay una pestaña abierta en Vencimientos.aspx (o cualquier pantalla del sitio),
  //    usarla y no abrir una nueva. Si no, crear una nueva.
  let tabId = null;
  let tabReusada = false;
  try {
    const candidatas = await chrome.tabs.query({ url: "*://controldocumentario.com/*" });
    // Preferimos una que ya esté en Vencimientos.aspx
    const enVenc = candidatas.find(t => /vencimientos\.aspx/i.test(t.url || ""));
    const elegida = enVenc || candidatas[0];
    if (elegida && elegida.id) {
      tabId = elegida.id;
      tabReusada = true;
    }
  } catch (_e) {}

  if (!tabId) {
    const tab = await chrome.tabs.create({ url, active: !!visible });
    tabId = tab.id;
  }

  const esperarCarga = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handler);
      reject(new Error("Timeout cargando la pestaña"));
    }, 30000);
    function handler(updId, info) {
      if (updId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handler);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(handler);
  });

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const ESPERA_MS = 10000; // 10 segundos pedidos por el usuario

  // Función inyectada: chequea si la página pidió login.
  async function ejecChequearLogin() {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector('input[type="password"]')
    });
    return !!result;
  }

  // Función inyectada: selecciona una opción ("Personal" o "Máquinas") en el dropdown
  // que tenga ambas opciones, y dispara el evento change.
  async function ejecSeleccionarTipo(textoOpcion) {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (texto) => {
        function norm(s) {
          return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        }
        const buscado = norm(texto);
        const selects = document.querySelectorAll("select");
        for (const sel of selects) {
          const opts = Array.from(sel.options || []);
          const tienePers = opts.some(o => norm(o.text) === "personal");
          const tieneMaq  = opts.some(o => norm(o.text) === "maquinas");
          if (!tienePers || !tieneMaq) continue;
          const objetivo = opts.find(o => norm(o.text) === buscado);
          if (!objetivo) continue;
          if (sel.value === objetivo.value) return { ok: true, yaEstaba: true };
          sel.value = objetivo.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          // Para ASP.NET algunos dropdowns tienen onchange con __doPostBack
          try {
            if (typeof sel.onchange === "function") sel.onchange();
          } catch (_e) {}
          return { ok: true, yaEstaba: false };
        }
        return { ok: false };
      },
      args: [textoOpcion]
    });
    return result || { ok: false };
  }

  // Función inyectada: clickea el botón "Buscar".
  async function ejecClickBuscar() {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const candidatos = [
          ...document.querySelectorAll('input[type="submit"]'),
          ...document.querySelectorAll('input[type="button"]'),
          ...document.querySelectorAll('button'),
          ...document.querySelectorAll('a')
        ];
        const btn = candidatos.find(b => {
          const t = (b.value || b.textContent || "").toLowerCase().trim();
          return t === "buscar" || t === "consultar" || t === "ver" || t === "mostrar";
        });
        if (btn) { btn.click(); return true; }
        return false;
      }
    });
    return !!result;
  }

  // Función inyectada: lee la tabla actual y devuelve los items con fecha.
  async function ejecLeerTabla(tipo, umbral) {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (tipoParam, umbralParam) => {
        function parsearFechaAR(texto) {
          const t = String(texto || "").trim();
          const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
          if (!m) return null;
          let dd = parseInt(m[1], 10);
          let mm = parseInt(m[2], 10) - 1;
          let yy = parseInt(m[3], 10);
          if (yy < 100) yy += 2000;
          const f = new Date(yy, mm, dd);
          if (isNaN(f.getTime())) return null;
          return f;
        }

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Buscar SOLO la tabla principal: tiene que tener un TH con texto "Nombre" o
        // "Descripción", y no debe contener otras tablas adentro (eso descarta los
        // contenedores que envuelven la tabla resumen del proveedor + la tabla principal).
        const tablas = Array.from(document.querySelectorAll("table"));
        let mejor = null;
        for (const t of tablas) {
          if (t.querySelector("table")) continue; // saltear tablas anidadas/contenedoras
          const ths = Array.from(t.querySelectorAll("th"));
          const headerTxts = ths.map(th => (th.textContent || "").trim().toLowerCase());
          const tieneNombre = headerTxts.some(h => /^(nombre|descripci[oó]n)$/.test(h));
          if (!tieneNombre) continue;
          mejor = t;
          break;
        }
        if (!mejor) {
          return { items: [], totalConFecha: 0, totalFilas: 0 };
        }

        // Encabezados de columna
        const ths2 = Array.from(mejor.querySelectorAll("th"));
        const headers = ths2.map(th => (th.textContent || "").trim());

        // Índices de columnas clave
        const idxEstado = headers.findIndex(h => /^estado/i.test(h.trim()));
        const idxNombre = headers.findIndex(h => /^(nombre|descripci[oó]n)/i.test(h.trim()));

        const filas = mejor.querySelectorAll("tr");
        let totalConFecha = 0;
        const items = [];

        for (const tr of filas) {
          const tds = Array.from(tr.querySelectorAll("td"));
          if (!tds.length) continue;

          // Saltar filas inhabilitadas
          if (idxEstado >= 0 && tds[idxEstado]) {
            const v = (tds[idxEstado].textContent || "").trim().toLowerCase();
            if (v.includes("inhabilit")) continue;
          }

          // Nombre de la fila — sólo desde la columna "Nombre"/"Descripción". Si no hay, saltar fila.
          let nombre = "";
          if (idxNombre >= 0 && tds[idxNombre]) nombre = (tds[idxNombre].textContent || "").trim();
          if (!nombre) continue;

          // Para cada celda con fecha, registrar un item
          for (let i = 0; i < tds.length; i++) {
            const td = tds[i];
            const f = parsearFechaAR(td.textContent);
            if (!f) continue;
            totalConFecha++;
            const columna = (headers[i] || "").trim();
            // Saltar la columna "Estado" (no es un requerimiento de documento real)
            if (/^estado/i.test(columna)) continue;
            const dias = Math.round((f - hoy) / (1000 * 60 * 60 * 24));
            if (dias > umbralParam) continue;
            items.push({
              tipo: tipoParam,
              nombre,
              columna,
              fecha: (td.textContent || "").trim(),
              diasFaltantes: dias
            });
          }
        }

        return { items, totalConFecha, totalFilas: filas.length };
      },
      args: [tipo, umbral]
    });
    return result || { items: [], totalConFecha: 0, totalFilas: 0 };
  }

  // Función inyectada: lee la tablita resumen del proveedor (Anexo1BUNGE, ClauNoRepBUN, etc.)
  // — la que NO tiene columna "Nombre" / "Descripción" pero sí tiene fechas.
  async function ejecLeerResumenProveedor(umbral) {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (umbralParam) => {
        function parsearFechaAR(texto) {
          const t = String(texto || "").trim();
          const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
          if (!m) return null;
          let dd = parseInt(m[1], 10);
          let mm = parseInt(m[2], 10) - 1;
          let yy = parseInt(m[3], 10);
          if (yy < 100) yy += 2000;
          const f = new Date(yy, mm, dd);
          if (isNaN(f.getTime())) return null;
          return f;
        }
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Buscar la tabla "resumen": tiene fechas, NO tiene columna Nombre/Descripción,
        // no tiene tablas anidadas, y tiene THs (encabezados de doc types).
        const tablas = Array.from(document.querySelectorAll("table"));
        let mejor = null, maxFechas = 0;
        for (const t of tablas) {
          if (t.querySelector("table")) continue;
          const ths = Array.from(t.querySelectorAll("th"));
          if (!ths.length) continue;
          const headerTxts = ths.map(th => (th.textContent || "").trim().toLowerCase());
          const tieneNombre = headerTxts.some(h => /^(nombre|descripci[oó]n)$/.test(h));
          if (tieneNombre) continue; // esa es la principal, no resumen
          let n = 0;
          for (const td of t.querySelectorAll("td")) {
            if (parsearFechaAR(td.textContent)) n++;
          }
          if (n > maxFechas) { maxFechas = n; mejor = t; }
        }
        if (!mejor) return { items: [], totalConFecha: 0 };

        const headers = Array.from(mejor.querySelectorAll("th")).map(th => (th.textContent || "").trim());
        const items = [];
        let totalConFecha = 0;
        for (const tr of mejor.querySelectorAll("tr")) {
          const tds = Array.from(tr.querySelectorAll("td"));
          if (!tds.length) continue;
          for (let i = 0; i < tds.length; i++) {
            const f = parsearFechaAR(tds[i].textContent);
            if (!f) continue;
            totalConFecha++;
            const columna = (headers[i] || "").trim();
            const dias = Math.round((f - hoy) / (1000 * 60 * 60 * 24));
            if (dias > umbralParam) continue;
            items.push({
              tipo: "general",
              nombre: "Proveedor",
              columna,
              fecha: (tds[i].textContent || "").trim(),
              diasFaltantes: dias
            });
          }
        }
        return { items, totalConFecha };
      },
      args: [umbral]
    });
    return result || { items: [], totalConFecha: 0 };
  }

  try {
    // 1) Si la pestaña la abrimos nosotros, esperar la carga inicial + 10 s extra.
    //    Si reusamos una pestaña ya abierta, no hace falta esperar la carga, sólo el delay.
    if (!tabReusada) {
      await esperarCarga();
      await dormir(ESPERA_MS);
    } else {
      await dormir(1000); // pequeño respiro
    }

    // 2) Chequear que no hayamos caído al login
    let tabActual = await chrome.tabs.get(tabId);
    let urlActual = (tabActual.url || "").toLowerCase();
    if (urlActual.includes("login") || await ejecChequearLogin()) {
      return { items: [], totalConFecha: 0, totalFilas: 0, url: tabActual.url, loginRequerido: true };
    }

    // Si no estamos en Vencimientos, forzar navegación manual
    if (!urlActual.includes("vencimientos.aspx")) {
      await chrome.tabs.update(tabId, { url });
      await esperarCarga();
      await dormir(ESPERA_MS);
      tabActual = await chrome.tabs.get(tabId);
      urlActual = (tabActual.url || "").toLowerCase();
      if (urlActual.includes("login") || await ejecChequearLogin()) {
        return { items: [], totalConFecha: 0, totalFilas: 0, url: tabActual.url, loginRequerido: true };
      }
      if (!urlActual.includes("vencimientos.aspx")) {
        return { items: [], totalConFecha: 0, totalFilas: 0, url: tabActual.url, loginRequerido: false };
      }
    }

    let totalConFechaTotal = 0;
    const itemsCombinados = [];

    // 3) PERSONAL
    const selPers = await ejecSeleccionarTipo("personal");
    if (!selPers.ok) {
      console.warn("[MAU] No se encontró el dropdown Personal/Máquinas. Sigo igual.");
    }
    // Si recién cambiamos el dropdown, esperar el postback dependiente
    if (selPers.ok && !selPers.yaEstaba) await dormir(ESPERA_MS);
    await ejecClickBuscar();
    await dormir(ESPERA_MS);
    const resPers = await ejecLeerTabla("personal", umbralDias);
    totalConFechaTotal += resPers.totalConFecha;
    itemsCombinados.push(...resPers.items);

    // 3.b) Documentos GENERALES del proveedor (la tablita chica de arriba),
    //      que es la misma para Personal y Máquinas — la leemos una sola vez.
    const resGen = await ejecLeerResumenProveedor(umbralDias);
    totalConFechaTotal += resGen.totalConFecha;
    itemsCombinados.push(...resGen.items);

    // 4) MÁQUINAS / VEHÍCULOS
    const selMaq = await ejecSeleccionarTipo("maquinas");
    if (selMaq.ok) {
      if (!selMaq.yaEstaba) await dormir(ESPERA_MS);
      await ejecClickBuscar();
      await dormir(ESPERA_MS);
      const resMaq = await ejecLeerTabla("vehiculo", umbralDias);
      totalConFechaTotal += resMaq.totalConFecha;
      itemsCombinados.push(...resMaq.items);
    } else {
      console.warn("[MAU] No se pudo seleccionar Máquinas en el dropdown.");
    }

    return {
      items: itemsCombinados,
      totalConFecha: totalConFechaTotal,
      totalFilas: 0,
      url: tabActual.url,
      loginRequerido: false
    };
  } finally {
    // Sólo cerrar la pestaña si la creamos nosotros y no era visible.
    // Si reusamos una pestaña que el usuario ya tenía abierta, no la tocamos.
    if (!tabReusada && !visible) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

function tgFormatearFechaHora(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tgPieVerificacion(totalLeidos) {
  const ahora = tgFormatearFechaHora(new Date());
  return `\n\n<i>— Leí ${totalLeidos} fechas en total (Personal + Vehículos). Detalle en <a href="https://controldocumentario.com/Vencimientos.aspx?menu=11">Vencimientos</a>. Último chequeo: ${ahora}.</i>`;
}

function tgFraseDias(dias) {
  if (dias < 0) {
    const n = Math.abs(dias);
    return n === 1 ? "VENCIDO hace 1 día" : `VENCIDO hace ${n} días`;
  }
  if (dias === 0) return "vence HOY";
  if (dias === 1) return "vence MAÑANA";
  return `vence en ${dias} días`;
}

// Agrupa items que tengan el mismo nombre + misma fecha en una sola línea con varias columnas.
function tgAgruparItems(lista) {
  const mapa = new Map();
  for (const it of lista) {
    const k = `${it.nombre}||${it.fecha}||${it.diasFaltantes}`;
    if (!mapa.has(k)) {
      mapa.set(k, { nombre: it.nombre, fecha: it.fecha, diasFaltantes: it.diasFaltantes, columnas: [] });
    }
    mapa.get(k).columnas.push(it.columna);
  }
  return Array.from(mapa.values()).sort((a, b) => a.diasFaltantes - b.diasFaltantes);
}

function tgIconoUrgencia(dias) {
  if (dias < 0) return "🔴"; // vencido
  if (dias <= 3) return "🟠"; // hoy / 1-3 días
  return "🟡"; // 4-10 días
}

function tgConstruirMensaje(items, umbralDias, _x, _totalLeidos = 0) {
  const generales = items.filter(i => i.tipo === "general");
  const personal = items.filter(i => i.tipo === "personal");
  const vehiculos = items.filter(i => i.tipo === "vehiculo");

  if (!generales.length && !personal.length && !vehiculos.length) {
    return [
      `✅ <b>Todo OK</b> — sin vencimientos en los próximos ${umbralDias} días.`,
      `📋 General (proveedor): sin vencimientos`,
      `👷 Personal: sin vencimientos`,
      `🚗 Vehículos: sin vencimientos`
    ].join("\n");
  }

  const partes = [
    `🔔 <b>Vencimientos próximos (${umbralDias} días)</b>`,
    `<i>🔴 vencido · 🟠 hoy / 1-3 días · 🟡 4-${umbralDias} días</i>`
  ];

  function bloque(titulo, lista, sinNombre = false) {
    // Ordenar por días ascendente (más vencidos primero, después los más cercanos)
    const ordenada = [...lista].sort((a, b) => a.diasFaltantes - b.diasFaltantes);
    partes.push(`\n${titulo}`);
    if (!ordenada.length) {
      partes.push(`✅ sin vencimientos`);
      return;
    }
    for (const it of ordenada.slice(0, 60)) {
      const ico = tgIconoUrgencia(it.diasFaltantes);
      const linea = sinNombre
        ? `${ico} ${escapeHtml(it.columna)} — ${it.fecha} (${tgFraseDias(it.diasFaltantes)})`
        : `${ico} ${escapeHtml(it.columna)} — ${escapeHtml(it.nombre)} — ${it.fecha} (${tgFraseDias(it.diasFaltantes)})`;
      partes.push(linea);
    }
    if (ordenada.length > 60) partes.push(`…y ${ordenada.length - 60} más.`);
  }

  bloque("📋 <b>GENERAL (proveedor)</b>", generales, true);
  bloque("👷 <b>PERSONAL</b>", personal);
  bloque("🚗 <b>VEHÍCULOS</b>", vehiculos);

  return partes.join("\n");
}

// Parte un mensaje largo en pedazos respetando saltos de línea.
function tgPartirMensaje(texto, max = 3800) {
  if (!texto || texto.length <= max) return [texto];
  const lineas = texto.split("\n");
  const trozos = [];
  let actual = "";
  for (const ln of lineas) {
    if ((actual.length + ln.length + 1) > max) {
      if (actual) trozos.push(actual);
      actual = ln;
    } else {
      actual = actual ? actual + "\n" + ln : ln;
    }
    // Si una sola línea ya es más larga que max, partirla a la fuerza
    while (actual.length > max) {
      trozos.push(actual.slice(0, max));
      actual = actual.slice(max);
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hashRapido(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

// ===================== TELEGRAM: SUBIDA DE SÁBANA POR PDF =====================

/**
 * Busca una pestaña abierta de controldocumentario.com (cualquier pantalla).
 * Si no hay, abre una en blanco. Devuelve { tabId, abrimosNosotros }.
 */
async function tgConseguirTabControldoc() {
  const candidatas = await chrome.tabs.query({ url: "*://controldocumentario.com/*" });
  if (candidatas.length && candidatas[0].id) {
    return { tabId: candidatas[0].id, abrimosNosotros: false };
  }
  const tab = await chrome.tabs.create({ url: "https://controldocumentario.com/", active: false });
  // Esperar a que cargue
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handler);
      reject(new Error("Timeout abriendo controldocumentario.com"));
    }, 30000);
    function handler(updId, info) {
      if (updId === tab.id && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handler);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(handler);
  });
  return { tabId: tab.id, abrimosNosotros: true };
}

/**
 * Renderiza cada página del PDF como JPEG usando pdf.js cargado en una pestaña
 * abierta de controldocumentario.com. Devuelve array de base64 JPEG, una por página.
 */
async function tgRenderPdfEnImagenes(base64Pdf, tabIdExterno) {
  const { tabId, abrimosNosotros } = tabIdExterno
    ? { tabId: tabIdExterno, abrimosNosotros: false }
    : await tgConseguirTabControldoc();
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async (b64) => {
        // Cargar pdf.js si no está
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = resolve;
            s.onerror = () => reject(new Error("No pude cargar pdf.js"));
            document.head.appendChild(s);
          });
          if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          }
        }
        // base64 → bytes
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        const out = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
          out.push({ pagina: i, base64 });
        }
        return out;
      },
      args: [base64Pdf]
    });
    return Array.isArray(result) ? result : [];
  } finally {
    if (abrimosNosotros) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

/**
 * Compara dos arrays como multisets (mismos elementos, misma cantidad, sin importar orden).
 */
function tgMismoMultiset(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const cnt = {};
  for (const x of a) { const k = String(x || ""); cnt[k] = (cnt[k] || 0) + 1; }
  for (const x of b) {
    const k = String(x || "");
    if (!cnt[k]) return false;
    cnt[k]--;
  }
  return Object.values(cnt).every(v => v === 0);
}

/**
 * Calcula similitud entre dos multisets (0 a 1).
 */
function tgSimilitudMultiset(a, b) {
  if (!a.length && !b.length) return 1;
  const cntA = {};
  for (const x of a) { const k = String(x || ""); cntA[k] = (cntA[k] || 0) + 1; }
  const cntB = {};
  for (const x of b) { const k = String(x || ""); cntB[k] = (cntB[k] || 0) + 1; }
  let coincidencias = 0;
  let total = 0;
  const claves = new Set([...Object.keys(cntA), ...Object.keys(cntB)]);
  for (const k of claves) {
    coincidencias += Math.min(cntA[k] || 0, cntB[k] || 0);
    total += Math.max(cntA[k] || 0, cntB[k] || 0);
  }
  return total ? coincidencias / total : 0;
}

/**
 * Busca un patrón de sábana guardado. Prueba en orden:
 *   1. Multiset exacto
 *   2. Misma cantidad de páginas + similitud >= 0.7 (un par de páginas mal-clasificadas tolerable)
 *   3. Misma cantidad total de páginas (último recurso, devuelve el más reciente)
 * Devuelve { patron, calidadMatch: "exacto"|"similar"|"por_cantidad"|null }.
 */
async function tgBuscarPatronSabana(paginasClasificadas) {
  const data = await chrome.storage.local.get(KEY_PATRONES_SABANA);
  const patrones = data[KEY_PATRONES_SABANA] || [];
  const firmaActual = paginasClasificadas.map(p => p.etiqueta || p.id || "");
  const totalPaginas = paginasClasificadas.length;

  // Filtrar candidatos válidos
  const validos = patrones.filter(p =>
    Array.isArray(p.firmaTipos) && Array.isArray(p.bloquesModal) && p.bloquesModal.length
  );

  // 1) Match exacto multiset
  for (const p of validos) {
    if (tgMismoMultiset(firmaActual, p.firmaTipos)) {
      return { patron: p, calidadMatch: "exacto" };
    }
  }

  // 2) Misma cantidad de páginas + similitud alta
  let mejorSim = null, mejorScore = 0;
  for (const p of validos) {
    if (p.firmaTipos.length !== totalPaginas) continue;
    const sim = tgSimilitudMultiset(firmaActual, p.firmaTipos);
    if (sim >= 0.7 && sim > mejorScore) {
      mejorSim = p;
      mejorScore = sim;
    }
  }
  if (mejorSim) {
    return { patron: mejorSim, calidadMatch: "similar" };
  }

  // 3) Misma cantidad de páginas (último recurso, ignora etiquetas)
  const porCantidad = validos
    .filter(p => p.firmaTipos.length === totalPaginas)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (porCantidad.length) {
    return { patron: porCantidad[0], calidadMatch: "por_cantidad" };
  }

  return { patron: null, calidadMatch: null };
}

/**
 * Agrupamiento básico (fallback): junta páginas consecutivas con misma etiqueta
 * + mismo apellido/CUIL/patente.
 * Devuelve un array de bloques con el mismo formato que bloquesModal.
 */
function tgAutoAgrupar(paginasClasificadas) {
  const bloques = [];
  let actual = null;
  for (const p of paginasClasificadas) {
    const etiqueta = p.etiqueta || p.id || "(sin clasificar)";
    const claveActual = `${etiqueta}__${p.apellido || ""}__${p.cuil || ""}__${p.patente || ""}`;
    if (actual && actual._clave === claveActual) {
      actual.paginas.push(p.pagina);
    } else {
      if (actual) { delete actual._clave; bloques.push(actual); }
      const personaTxt = [p.apellido, p.nombre].filter(Boolean).join(" ").trim() || (p.patente ? `patente ${p.patente}` : "");
      actual = {
        _clave: claveActual,
        nombre: personaTxt ? `${etiqueta} — ${personaTxt}` : etiqueta,
        paginas: [p.pagina],
        // Por defecto, asumimos que el destino es el mismo nombre de la etiqueta
        // (que es el nombre del requerimiento en controldoc).
        requerimientos: etiqueta && etiqueta !== "(sin clasificar)" ? [etiqueta] : [],
        meta: {
          apellido: p.apellido || "",
          nombre: p.nombre || "",
          cuil: p.cuil || "",
          patente: p.patente || ""
        }
      };
    }
  }
  if (actual) { delete actual._clave; bloques.push(actual); }
  return bloques;
}

/**
 * Comparación directa imagen vs imagen entre páginas nuevas y páginas de referencia del mapeo.
 * Es el método principal de matching: Claude ve ambas imágenes y decide si son el mismo documento.
 * Solo puede haber cambiado la fecha/monto — la estructura del formulario es idéntica.
 *
 * @param {Array<{pagina:number, base64:string}>} nuevasPaginas
 * @param {{ imagenes: Array<{pagina:number, base64:string}>, bloques: Array }} referencia
 * @returns {Promise<Array<{nombre,paginas,requerimientos,meta}>|null>}
 */
async function compararPaginasConReferencia(nuevasPaginas, referencia) {
  const tieneImagenes = (referencia?.imagenesPorBloque && Object.keys(referencia.imagenesPorBloque).length > 0)
    || (referencia?.imagenes?.length > 0);
  if (!nuevasPaginas?.length || !referencia?.bloques?.length || !tieneImagenes) return null;

  const { apiKey, modelo } = await obtenerApiKeyYModelo();

  // Obtener TODAS las imágenes de referencia por bloque (una por cada página del bloque)
  const bloquesRef = referencia.bloques.map((b) => {
    let imagenesRef = [];
    if (Array.isArray(referencia.imagenes) && referencia.imagenes.length > 0) {
      // Buscamos la imagen de cada página asignada a este bloque en el mapeo
      imagenesRef = (b.paginas || []).map(pNum => {
        const img = referencia.imagenes.find((i) => i.pagina === pNum);
        return img ? img.base64 : null;
      }).filter(Boolean);
    }
    // Fallback: imagenesPorBloque (formato legacy, 1 sola imagen por bloque)
    if (imagenesRef.length === 0 && referencia.imagenesPorBloque && referencia.imagenesPorBloque[b.nombre]) {
      imagenesRef = [referencia.imagenesPorBloque[b.nombre]];
    }
    return imagenesRef.length > 0 ? { ...b, imagenesRef } : null;
  }).filter(Boolean);

  if (!bloquesRef.length) return null;

  // Log diagnóstico: cuántas imágenes de referencia tiene cada bloque
  bloquesRef.forEach((b, idx) => {
    console.log(`[MAU] Ref ${idx+1} "${b.meta?.apellido || b.nombre}": ${b.imagenesRef.length} imagen(es) de referencia, páginas del mapeo: [${(b.paginas||[]).join(",")}]`);
  });
  console.log(`[MAU] Páginas nuevas a comparar: ${nuevasPaginas.length}`);

  // ── 1 sola llamada: Claude extrae tipo + CUIL de cada página, el código hace el match ──
  const content = [];

  // Mostrar referencias con TODAS sus páginas para que Claude reconozca cada tipo de formulario del bloque
  content.push({ type: "text", text: "BLOQUES DE REFERENCIA (todas las páginas del bloque, con CUIL del empleado):\n" });
  bloquesRef.forEach((b, idx) => {
    const cuil = b.meta?.cuil ? `CUIL: ${b.meta.cuil}` : "CUIL: (no registrado)";
    const apellido = b.meta?.apellido || "";
    content.push({ type: "text", text: `\nRef ${idx + 1}: ${apellido} — ${cuil} (${b.imagenesRef.length} tipo(s) de formulario en este bloque)` });
    b.imagenesRef.forEach((imgBase64, pIdx) => {
      content.push({ type: "text", text: `  Formulario ${pIdx + 1} de Ref ${idx + 1}:` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } });
    });
  });

  // Páginas nuevas
  content.push({ type: "text", text: "\n\nPÁGINAS NUEVAS:\n" });
  nuevasPaginas.forEach((p) => {
    content.push({ type: "text", text: `\nPágina ${p.pagina}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.base64 } });
  });

  content.push({
    type: "text",
    text: `

TAREA: para cada página nueva, determiná a qué Ref pertenece.

CÓMO HACER EL MATCH:
Cada Ref representa un empleado y tiene uno o más tipos de formulario (Formulario 1, Formulario 2, etc.).
Una página nueva pertenece a un Ref si es del MISMO TIPO de formulario que alguno de sus formularios:
  - Mismo nombre o título del formulario
  - Misma empresa o institución que lo emite
  - Misma estructura general del documento

No importa el orden en que vienen las páginas, la calidad del scan, ni pequeñas diferencias de contenido.
Lo que importa es si es el MISMO TIPO de formulario.

CUIL (identificador del empleado):
Si la página tiene un CUIL legible, usalo para confirmar a qué Ref pertenece.
Si el CUIL no es legible o no aparece, hacé el match solo por tipo de formulario.
Un CUIL distinto al del Ref = la página pertenece al Ref con ese CUIL, no al que asignaste visualmente.

Si una página definitivamente no es ningún tipo de formulario de ningún Ref → bloque: null.

IMPORTANTE: reportá TODAS las páginas nuevas en el JSON, incluso las que no coinciden (bloque: null). Leé e informá el CUIL cuando sea legible.

Respondé SOLO JSON válido, sin texto extra:
{
  "paginas": [
    { "pagina_nueva": 1, "cuil_leido": "20-12345678-9", "bloque": "Ref 1" },
    { "pagina_nueva": 2, "cuil_leido": "", "bloque": null }
  ]
}`
  });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model: modelo, max_tokens: 2500, messages: [{ role: "user", content }] })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude (comparar imágenes) ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const json = await resp.json();
  const textoResp = (json?.content?.[0]?.text || "").trim();
  console.log(`[MAU] Respuesta Claude (${textoResp.length} chars):`, textoResp.slice(0, 800));

  let parsed = null;
  // Claude ahora razona primero y pone el JSON al final en un bloque ```json ... ```
  // Intentamos extraer ese bloque primero; si no, caemos en el JSON crudo
  try {
    const bloqueJson = textoResp.match(/```json\s*([\s\S]*?)```/i);
    if (bloqueJson) {
      parsed = JSON.parse(bloqueJson[1].trim());
    } else {
      parsed = JSON.parse(textoResp);
    }
  } catch {
    const m = textoResp.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }

  if (!parsed?.paginas?.length) return null;

  // El código hace el match fino: CUIL leído por Claude vs CUIL almacenado en cada bloque de referencia
  const normCuil = (s) => String(s || "").replace(/\D/g, "");

  // Usamos el ÍNDICE en bloquesRef como clave única, porque todos los bloques pueden
  // tener el mismo nombre (ej: "Bloque") cuando el usuario no los renombra en el modal.
  // Indexar por nombre colapsaría bloques distintos en uno solo.
  const bloquesMapIdx = new Map(); // key: índice en bloquesRef → { refBloque, paginas }

  for (const item of parsed.paginas) {
    if (!item.pagina_nueva) continue;
    if (!item.bloque) {
      console.log(`[MAU] Pág ${item.pagina_nueva} → sin asignar (CUIL=${normCuil(item.cuil_leido) || "no leído"})`);
      continue;
    }

    // Resolver el bloque que indicó Claude → primero por nombre exacto, luego por "Ref N"
    let refIdx = bloquesRef.findIndex((b) => b.nombre === item.bloque);
    if (refIdx === -1) {
      const mm = String(item.bloque).match(/^Ref\s*(\d+)$/i);
      if (mm) {
        const i = parseInt(mm[1]) - 1;
        if (i >= 0 && i < bloquesRef.length) refIdx = i;
      }
    }
    if (refIdx === -1) continue;
    let refBloque = bloquesRef[refIdx];

    // Validación por CUIL: si el CUIL leído no coincide con el bloque que indicó Claude,
    // buscamos el bloque correcto por CUIL
    const cuilLeido = normCuil(item.cuil_leido);
    const cuilBloque = normCuil(refBloque.meta?.cuil);

    if (cuilLeido && cuilBloque && cuilLeido !== cuilBloque) {
      const corrIdx = bloquesRef.findIndex((b) => normCuil(b.meta?.cuil) === cuilLeido);
      if (corrIdx !== -1) {
        console.log(`[MAU] Pág ${item.pagina_nueva}: CUIL ${cuilLeido} reasignado de Ref ${refIdx+1} → Ref ${corrIdx+1} (${bloquesRef[corrIdx].meta?.apellido || ""})`);
        refIdx = corrIdx;
        refBloque = bloquesRef[corrIdx];
      } else {
        // El CUIL leído no es de ningún empleado conocido (puede ser el CUIL del empleador
        // que aparece impreso en el documento). En ese caso confiamos en el match visual de Claude.
        console.log(`[MAU] Pág ${item.pagina_nueva}: CUIL ${cuilLeido} no es de ningún empleado conocido (posiblemente CUIL del empleador) → se mantiene asignación visual a Ref ${refIdx+1} (${refBloque.meta?.apellido || ""})`);
      }
    }

    console.log(`[MAU] Pág ${item.pagina_nueva} → Ref ${refIdx+1} "${refBloque.meta?.apellido || refBloque.nombre}" CUIL=${cuilLeido || "(sin cuil)"}`);
    if (!bloquesMapIdx.has(refIdx)) {
      bloquesMapIdx.set(refIdx, {
        nombre: refBloque.nombre,
        paginas: [],
        paginasMapeo: (refBloque.paginas || []).length, // cuántas páginas tiene este bloque en el mapeo
        requerimientos: refBloque.requerimientos || [],
        meta: { ...refBloque.meta }
      });
    }
    if (cuilLeido) bloquesMapIdx.get(refIdx).meta = { ...bloquesMapIdx.get(refIdx).meta, cuil: item.cuil_leido };
    bloquesMapIdx.get(refIdx).paginas.push(item.pagina_nueva);
  }

  // Validar que cada bloque encontrado tiene TODAS las páginas que dice el mapeo.
  // Si falta alguna página, el bloque se descarta (el mapeo manda).
  // Bloques de otras personas que sí están completos se suben igual (listas cortas son válidas).
  const descartados = [];
  const resultado = Array.from(bloquesMapIdx.values()).filter((b) => {
    if (!b.paginas.length || !b.requerimientos.length) return false;
    if (b.paginasMapeo > 0 && b.paginas.length < b.paginasMapeo) {
      console.log(`[MAU] Bloque "${b.meta?.apellido || b.nombre}" descartado: encontradas ${b.paginas.length}/${b.paginasMapeo} páginas del mapeo`);
      descartados.push(b);
      return false;
    }
    return true;
  });

  // Adjuntamos los descartados al array resultado para que los callers puedan informar al usuario
  if (resultado.length) resultado.descartados = descartados;
  return resultado.length ? resultado : null;
}

/**
 * Remapea las páginas de los bloques guardados al ORDEN ACTUAL del PDF.
 * Si el patrón guardado dice "bloque 1 = páginas 1,2 (tipo A, A)" pero ahora
 * los tipos A están en posiciones 3 y 5, devuelve "bloque 1 = páginas 3, 5".
 * Mismo algoritmo que panel.js línea 337-349.
 */
function tgRemapearPaginas(patron, paginasClasificadas) {
  // Construir disponibles con info completa (tipo + cuil + apellido)
  const normStr = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const disponibles = paginasClasificadas.map((p, i) => ({
    tipo: String(p.etiqueta || p.id || "desconocido"),
    pagina: i + 1,
    cuil: normStr(p.cuil || "").replace(/[^0-9]/g, ""),
    apellido: normStr(p.apellido || ""),
    usada: false
  }));

  const remapeados = patron.bloquesModal.map((b) => {
    const cuilBloque = normStr(b.meta?.cuil || "").replace(/[^0-9]/g, "");
    const apellidoBloque = normStr(b.meta?.apellido || "");
    const nuevasPags = [];

    for (const pOriginal of (b.paginas || [])) {
      const tipoOriginal = String((patron.firmaTipos[pOriginal - 1]) || "desconocido");

      // Candidatos del mismo tipo no usados
      const candidatos = disponibles.filter((d) => !d.usada && d.tipo === tipoOriginal);
      if (!candidatos.length) continue;

      let slot = null;

      // 1) Si hay CUIL del bloque, buscar coincidencia exacta de CUIL
      if (cuilBloque) {
        slot = candidatos.find((d) => d.cuil && d.cuil === cuilBloque) || null;
      }

      // 2) Si no hubo match por CUIL, intentar por apellido
      if (!slot && apellidoBloque) {
        slot = candidatos.find((d) => d.apellido && d.apellido.includes(apellidoBloque)) || null;
      }

      // 3) Fallback: primer candidato disponible del tipo correcto
      if (!slot) slot = candidatos[0];

      if (slot) {
        slot.usada = true;
        nuevasPags.push(slot.pagina);
      }
    }
    return { ...b, paginas: nuevasPags };
  }).filter((b) => b.paginas.length);

  return remapeados;
}

/**
 * Le pasa a Claude la clasificación de las páginas + los patrones guardados,
 * y le pide que matchee inteligentemente (independiente del orden, por contenido/persona).
 * Devuelve { patronMatch, bloques, confianza } o null si no encuentra match.
 */
async function tgMatchearPatronConClaude(paginasClasificadas, patrones) {
  if (!patrones || !patrones.length) return null;

  const { apiKey, modelo } = await obtenerApiKeyYModelo();

  // Resumen de las páginas actuales
  const resumenPaginas = paginasClasificadas.map(p => {
    const persona = [p.apellido, p.nombre].filter(Boolean).join(" ").trim();
    const extras = [];
    if (persona) extras.push(persona);
    if (p.cuil) extras.push(`CUIL ${p.cuil}`);
    if (p.patente) extras.push(`patente ${p.patente}`);
    return `Página ${p.pagina}: ${p.etiqueta || p.id || "desconocido"}${extras.length ? " — " + extras.join(" · ") : ""}`;
  }).join("\n");

  // Resumen de cada patrón guardado
  const resumenPatrones = patrones.map((pat, idx) => {
    const bloquesTxt = (pat.bloquesModal || []).map((b, i) => {
      const tipos = (b.paginas || []).map(n => (pat.firmaTipos || [])[n - 1] || "?").join(", ");
      const reqs = (b.requerimientos || []).join(" + ");
      return `  Bloque ${i + 1}: "${b.nombre || ""}" (${b.paginas.length} páginas, tipos: ${tipos}) → destinos: ${reqs}`;
    }).join("\n");
    return `Patrón ${idx + 1}: "${pat.nombre || "(sin nombre)"}" — ${pat.firmaTipos?.length || 0} páginas totales\n${bloquesTxt}`;
  }).join("\n\n");

  const prompt = `Soy un sistema que sube documentos a controldocumentario.com. Tengo:

**SÁBANA NUEVA (clasificada por Claude, en el orden actual):**
${resumenPaginas}

**PATRONES GUARDADOS de sábanas anteriores (cada uno tiene bloques con páginas + destinos):**
${resumenPatrones}

**TU TAREA:**
1. Decir si la sábana nueva corresponde a alguno de los patrones guardados (mismo "tipo de sábana", aunque las páginas estén en distinto orden o haya alguna leve diferencia de clasificación).
2. Si hay match, reasignar los bloques al orden actual de la sábana nueva, usando contenido/persona/CUIL para identificar qué páginas del actual corresponden a qué bloque guardado.
3. Si NO hay match claro, devolver patronMatch: null.

REGLAS:
- Una página puede ir a varios destinos (un bloque puede tener requerimientos múltiples).
- Si el patrón tenía 3 páginas en un bloque y la sábana nueva tiene esas 3 páginas pero en posiciones distintas, encontralas y armá el bloque con los números nuevos.
- Confianza: alta (>= 80) si las personas/tipos coinciden bien; media (50-79) si hay similitud parcial; baja (< 50) → mejor null.

Respondé SOLO un JSON válido, sin markdown, así:
{
  "patron_match": "nombre del patrón o null",
  "confianza": 0-100,
  "razonamiento_breve": "una línea explicando",
  "bloques": [
    {
      "nombre": "...",
      "paginas": [3, 5, 7],
      "requerimientos": ["destino 1", "destino 2"],
      "meta": {"apellido": "", "cuil": "", "patente": ""}
    }
  ]
}

Si patron_match es null, devolvé bloques: [].`;

  const body = {
    model: modelo,
    max_tokens: 2000,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude (match patrón) ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const json = await resp.json();
  const textoRespuesta = (json?.content?.[0]?.text || "").trim();

  let parsed = null;
  try { parsed = JSON.parse(textoRespuesta); }
  catch (_e) {
    const m = textoRespuesta.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed) return null;

  const patronMatch = parsed.patron_match;
  const confianza = Number(parsed.confianza) || 0;
  const bloques = Array.isArray(parsed.bloques) ? parsed.bloques : [];
  const razonamiento = String(parsed.razonamiento_breve || "");

  if (!patronMatch || confianza < 50 || !bloques.length) return null;

  return { patronMatch, confianza, bloques, razonamiento };
}

/**
 * Arma el plan de subida usando Claude para matchear contra patrones guardados.
 * Si Claude no encuentra match → fallback al matching mecánico → fallback auto-agrupado.
 */
async function tgArmarPlanSubida(paginasClasificadas) {
  // 1) Pedirle a Claude que matchee patrones (entiende contenido, no solo etiquetas)
  try {
    const data = await chrome.storage.local.get(KEY_PATRONES_SABANA);
    const patrones = data[KEY_PATRONES_SABANA] || [];
    const validos = patrones.filter(p =>
      Array.isArray(p.firmaTipos) && Array.isArray(p.bloquesModal) && p.bloquesModal.length
    );
    if (validos.length) {
      const matchClaude = await tgMatchearPatronConClaude(paginasClasificadas, validos);
      if (matchClaude) {
        return {
          bloques: matchClaude.bloques,
          origen: "patron-claude",
          patronUsado: matchClaude.patronMatch,
          confianzaClaude: matchClaude.confianza,
          razonamientoClaude: matchClaude.razonamiento
        };
      }
    }
  } catch (e) {
    console.warn("[MAU] Match con Claude falló, sigo con fallback:", e);
  }

  // 2) Fallback: matching mecánico por multiset de etiquetas
  const { patron, calidadMatch } = await tgBuscarPatronSabana(paginasClasificadas);
  if (patron && Array.isArray(patron.bloquesModal) && patron.bloquesModal.length) {
    const bloquesRemapeados = tgRemapearPaginas(patron, paginasClasificadas);
    return {
      bloques: bloquesRemapeados,
      origen: "patron",
      patronUsado: patron.nombre || "(sin nombre)",
      calidadMatch
    };
  }

  // 3) Fallback final: auto-agrupado por consecutivas mismo tipo+persona
  const bloques = tgAutoAgrupar(paginasClasificadas);
  return { bloques, origen: "autoagrupado", patronUsado: null, calidadMatch: null };
}

/**
 * Construye el mensaje del PLAN de subida para mandar a Telegram.
 */
function tgConstruirMensajePlan(plan) {
  const partes = [];
  if (plan.origen === "patron-claude") {
    partes.push(`📋 <b>Plan de subida</b> (patrón: <i>${escapeHtml(plan.patronUsado)}</i>) 🧠 matcheado por Claude (confianza ${plan.confianzaClaude}%)`);
    if (plan.razonamientoClaude) partes.push(`<i>${escapeHtml(plan.razonamientoClaude)}</i>`);
  } else if (plan.origen === "patron") {
    let etiquetaCalidad = "";
    if (plan.calidadMatch === "exacto") etiquetaCalidad = " ✅ match exacto";
    else if (plan.calidadMatch === "similar") etiquetaCalidad = " ⚠️ match similar";
    else if (plan.calidadMatch === "por_cantidad") etiquetaCalidad = " ⚠️ match por cantidad de páginas (revisar bien)";
    partes.push(`📋 <b>Plan de subida</b> (patrón aprendido: <i>${escapeHtml(plan.patronUsado)}</i>)${etiquetaCalidad}`);
  } else {
    partes.push(`📋 <b>Plan de subida</b> (no había patrón guardado, agrupé automático)`);
  }
  partes.push(`<b>${plan.bloques.length}</b> grupo(s):\n`);
  let idx = 1;
  for (const b of plan.bloques) {
    const reqs = (b.requerimientos && b.requerimientos.length)
      ? b.requerimientos.map(r => escapeHtml(r)).join(" + ")
      : "<i>sin destino asignado</i>";
    const nPaginas = (b.paginas || []).length;
    const pagsTxt = (b.paginas || []).join(", ");
    partes.push(`🟦 <b>Grupo ${idx}</b> — ${escapeHtml(b.nombre || "(sin nombre)")}`);
    partes.push(`   📄 Páginas: ${pagsTxt} (${nPaginas} hoja${nPaginas === 1 ? "" : "s"})`);
    partes.push(`   ➡️ Destino${b.requerimientos && b.requerimientos.length === 1 ? "" : "s"}: ${reqs}`);
    partes.push("");
    idx++;
  }
  if (plan.origen === "autoagrupado") {
    partes.push(`<i>💡 Si esta agrupación no es correcta, cargá la sábana una vez por el panel manual (Bandeja.aspx) para que aprenda el patrón. Después la próxima vez ya viene auto.</i>`);
  }
  return partes.join("\n");
}

/**
 * Manda una foto (base64 JPEG) al chat de Telegram con caption opcional.
 */
async function tgEnviarFoto(token, chatId, base64Jpeg, fileName, caption) {
  const bin = atob(base64Jpeg);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", blob, fileName);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendPhoto`;
  const resp = await fetch(url, { method: "POST", body: form });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`sendPhoto ${resp.status}: ${err.slice(0, 200)}`);
  }
  return await resp.json();
}

/**
 * Baja un archivo de Telegram (file_id) y devuelve { base64, mediaType, sizeBytes }.
 * Usa el endpoint getFile + descarga del file_path.
 */
async function tgBajarArchivo(token, fileId) {
  const u1 = `https://api.telegram.org/bot${encodeURIComponent(token)}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const r1 = await fetch(u1);
  if (!r1.ok) throw new Error(`getFile ${r1.status}`);
  const j1 = await r1.json();
  if (!j1.ok || !j1.result || !j1.result.file_path) throw new Error("getFile: respuesta sin file_path");
  const filePath = j1.result.file_path;
  const sizeBytes = j1.result.file_size || 0;
  if (sizeBytes && sizeBytes > TG_MAX_PDF_BYTES) {
    throw new Error(`El archivo pesa ${(sizeBytes / 1024 / 1024).toFixed(1)} MB, máximo permitido 20 MB.`);
  }
  const u2 = `https://api.telegram.org/file/bot${encodeURIComponent(token)}/${filePath}`;
  const r2 = await fetch(u2);
  if (!r2.ok) throw new Error(`Descarga ${r2.status}`);
  const buf = await r2.arrayBuffer();
  // Convertir ArrayBuffer a base64 (en chunks para no estallar el call stack)
  const bytes = new Uint8Array(buf);
  let binario = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binario);
  return { base64, mediaType: "application/pdf", sizeBytes: bytes.length };
}

/**
 * Manda el PDF entero a Claude pidiendo clasificación página por página.
 * Devuelve un arreglo: [{ pagina, id, etiqueta, apellido, nombre, cuil, patente, periodo }, ...]
 */
async function clasificarSabanaConClaude(base64Pdf) {
  const { apiKey, modelo } = await obtenerApiKeyYModelo();
  const prompt = `Te paso un PDF "sábana" — varios documentos laborales argentinos pegados uno atrás del otro. Para CADA PÁGINA del PDF, decime qué tipo de documento es y los datos del empleado o vehículo, si aplica.

Tipos posibles:
${construirListaTipos()}

REGLAS CLAVE:
* Si la página tiene "ENTREGA DE ROPA DE TRABAJO" o "Resolución 299/11" o tabla con casco/botines/guantes → "entrega_epp".
* Si dice "Planilla de asistencia" o "capacitación" → "capacitacion".
* Tabla con jubilación/ley 19032/sindical/hs trabajadas → "recibo_haberes".
* Página con logo ARCA + recuadro "931" + tablas "REGIMEN NACIONAL DE SEGURIDAD SOCIAL" → es "f931". Es el formulario de declaración jurada, nunca un ticket de banco.
* Banco Provincia título "Pago" + "Número de VEP" + lista impuestos con códigos 351 (CONTRIBUCIONES SEG. SOCIAL), 301 (EMPLEADOR-APORTES SEG. SOCIAL), 352 (CONTRIBUCIONES OBRA SOCIAL), 302, 312 (ART), 28 (SEGURO DE VIDA) → es "pago_f931". Estos códigos son la señal definitiva.
* Banco Provincia título "Nueva transferencia" + campo Referencia "VAR f.Desempleo" → SIEMPRE "transferencia_desempleo". No confundir: el pago_f931 tiene códigos de impuestos 351/301/352, el transferencia_desempleo tiene "Titular cuenta destino" y "VAR f.Desempleo".
* Banco Provincia título "Pago" + dice "Nombre del Ente Abonado: UOCRA" (o "UOCRA - Online") → es "pago_uocra". Ningún otro ticket tiene ese campo con UOCRA. Con impuestos 308/358 (autónomos) → es "pago_autonomo".
* NUNCA pongas como empleado al titular de la empresa "MATESIN CLAUDIO FABIAN" (CUIL 20-20999512-4), excepto si la página es claramente de "MATESIN GENARO" (que sí es empleado).
* Si la página está rotada 90° o 180°, igual leela.

Datos a extraer por página (solo del EMPLEADO, no de la empresa):
- cuil: en formato 20-12345678-9, vacío si no se ve.
- apellido y nombre: del trabajador.
- patente: solo si el doc es de seguro automotor (ABC123 o AB123CD).
- periodo: YYYY-MM si aparece.

Respondé SOLO con un JSON válido, sin markdown ni explicaciones, así:
{"paginas":[{"pagina":1,"id":"xxx","cuil":"","apellido":"","nombre":"","patente":"","periodo":""},{"pagina":2,"id":"xxx",...}]}

Si no podés identificar el tipo de una página, usá "desconocido".`;

  const body = {
    model: modelo,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
          { type: "text", text: prompt }
        ]
      }
    ]
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const json = await resp.json();
  const textoRespuesta = (json?.content?.[0]?.text || "").trim();

  // Parsear el JSON
  let parsed = null;
  try { parsed = JSON.parse(textoRespuesta); }
  catch (_e) {
    const m = textoRespuesta.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  const arr = Array.isArray(parsed?.paginas) ? parsed.paginas : [];
  // Normalizar
  return arr.map((p, i) => {
    const idCrudo = String(p?.id || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const tipo = TIPOS_DOCUMENTO.find(t => t.id === idCrudo);
    return {
      pagina: typeof p?.pagina === "number" ? p.pagina : (i + 1),
      id: tipo ? tipo.id : "desconocido",
      etiqueta: tipo ? tipo.etiqueta : "",
      cuil: String(p?.cuil || "").trim(),
      apellido: String(p?.apellido || "").trim(),
      nombre: String(p?.nombre || "").trim(),
      patente: String(p?.patente || "").trim(),
      periodo: String(p?.periodo || "").trim()
    };
  });
}

/**
 * Construye el mensaje preview de la clasificación de la sábana.
 */
function tgConstruirPreviewSabana(paginas, nombreArchivo, sizeBytes) {
  if (!paginas.length) {
    return `⚠️ Recibí <b>${escapeHtml(nombreArchivo)}</b> pero no pude clasificar ninguna página. Probá de nuevo o subí el PDF a mano.`;
  }
  // Agrupar por tipo (id) para el resumen
  const conteos = {};
  for (const p of paginas) {
    const k = p.etiqueta || "(sin etiqueta)";
    conteos[k] = (conteos[k] || 0) + 1;
  }
  const totalReconocidos = paginas.filter(p => p.id !== "desconocido").length;
  const totalDudosos = paginas.length - totalReconocidos;

  const partes = [
    `📥 <b>Sábana recibida</b>: ${escapeHtml(nombreArchivo)} (${(sizeBytes / 1024).toFixed(0)} KB)`,
    `Detecté <b>${paginas.length}</b> páginas:`,
    ""
  ];

  // Resumen por tipo
  for (const [etiqueta, n] of Object.entries(conteos)) {
    partes.push(`• <b>${n}</b> × ${escapeHtml(etiqueta)}`);
  }

  partes.push("");
  partes.push("<b>Detalle por página:</b>");
  for (const p of paginas) {
    const persona = [p.apellido, p.nombre].filter(Boolean).join(" ").trim();
    const ico = p.id === "desconocido" ? "❓" : "📄";
    const etiqueta = p.etiqueta || p.id;
    const extras = [];
    if (persona) extras.push(persona);
    if (p.cuil) extras.push(p.cuil);
    if (p.patente) extras.push(`patente ${p.patente}`);
    if (p.periodo) extras.push(p.periodo);
    const cola = extras.length ? ` — ${extras.join(" · ")}` : "";
    partes.push(`${ico} Pág. ${p.pagina}: ${escapeHtml(etiqueta)}${escapeHtml(cola)}`);
  }

  partes.push("");
  if (totalDudosos > 0) {
    partes.push(`⚠️ Hay <b>${totalDudosos}</b> página(s) que no pude clasificar bien (marcadas con ❓).`);
  }
  partes.push("");
  partes.push(`👉 Etapa 1 lista. Cuando armemos la Etapa 2, vas a poder responder <b>SI</b> para que suba todo, o <b>NO</b> para cancelar.`);

  return partes.join("\n");
}

// ===================== ETAPA 2: SUBIDA REAL DE LA SÁBANA =====================

/**
 * Busca o abre Bandeja.aspx (donde corre el panel manual).
 * Devuelve { tabId, abrimosNosotros }.
 */
async function tgConseguirTabBandeja() {
  const candidatas = await chrome.tabs.query({ url: "*://controldocumentario.com/Bandeja.aspx*" });
  if (candidatas.length && candidatas[0].id) {
    // Activarla para que el usuario vea lo que hace
    try { await chrome.tabs.update(candidatas[0].id, { active: true }); } catch {}
    return { tabId: candidatas[0].id, abrimosNosotros: false };
  }
  const tab = await chrome.tabs.create({
    url: "https://controldocumentario.com/Bandeja.aspx?menu=1",
    active: true
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handler);
      reject(new Error("Timeout abriendo Bandeja.aspx"));
    }, 30000);
    function handler(updId, info) {
      if (updId === tab.id && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handler);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(handler);
  });
  // Esperar 5 s extra para que panel.js se inyecte y arme la UI
  await new Promise(r => setTimeout(r, 5000));
  return { tabId: tab.id, abrimosNosotros: true };
}

/**
 * Inyecta el PDF + plan de bloques DIRECTAMENTE en el panel via window.MAUPanel,
 * sin pasar por la UI ni re-pagar Claude. Devuelve un resumen.
 */
async function tgDispararSubidaEnPanel(tabId, base64Pdf, fileName, bloquesPlan) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (b64, name, bloques) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const log = (s) => { try { console.log("[MAU TG-Etapa2]", s); } catch {} };

      // 1) Esperar a que el panel esté montado y que window.MAUPanel exista
      log("Esperando window.MAUPanel…");
      const t0 = Date.now();
      while (!window.MAUPanel && Date.now() - t0 < 30000) {
        await wait(500);
      }
      if (!window.MAUPanel) {
        return { ok: false, error: "El panel no expone window.MAUPanel. Recargá la extensión." };
      }
      const P = window.MAUPanel;

      // 2) Detectar requerimientos si están vacíos
      try {
        if (!P.estado.requerimientos || !P.estado.requerimientos.length) {
          log("Detectando requerimientos pendientes…");
          await P.detectarRequerimientosPendientes();
        }
      } catch (e) {
        return { ok: false, error: "Falló detectarRequerimientosPendientes: " + (e.message || e) };
      }

      if (!P.estado.requerimientos || !P.estado.requerimientos.length) {
        return { ok: false, error: "No se detectaron requerimientos pendientes en la página." };
      }
      log(`Requerimientos detectados: ${P.estado.requerimientos.length}`);

      // 3) Convertir base64 → File
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], name, { type: "application/pdf" });

      // 4) Aplicar los bloques pre-calculados en Etapa 1 (sin re-clasificar con Claude).
      //    Los bloques ya tienen cuil/apellido en meta desde la clasificación de Etapa 1.
      log("Aplicando bloques (clasificación ya hecha en Etapa 1)…");
      try {
        await P.aplicarBloquesModal(file, bloques);
      } catch (e) {
        return { ok: false, error: "Falló aplicarBloquesModal: " + (e.message || e) };
      }

      // 5) Verificar que se asignaron archivos
      const filas = P.estado.filas || [];
      const totalConArchivo = filas.filter(f => f.archivo).length;
      log(`Filas con archivo asignado: ${totalConArchivo}/${filas.length}`);
      if (totalConArchivo === 0) {
        return { ok: false, error: "Después de aplicar los bloques, ninguna fila quedó con archivo." };
      }

      // 6) Procesar todo (esto sí hace clicks en la página de controldoc)
      log("Llamando a procesarTodo()…");
      try {
        // procesarTodo no se await porque puede tardar mucho y bloquearía el sw.
        // En su lugar, lo lanzamos y polleamos el estado.filas.
        const promesaProc = P.procesarTodo();

        // Espera inicial: darle tiempo a procesarTodo para arrancar y poner
        // la primera fila en "procesando" antes de que empecemos a verificar.
        // Sin esto, el primer poll ve 0 filas procesando y sale prematuramente.
        await wait(12000);

        // Esperar máximo 15 minutos hasta que todas las filas lleguen a un estado terminal
        const tSub = Date.now();
        while (Date.now() - tSub < 900000) {
          await wait(4000);
          const filasAhora = (P.estado.filas || []).filter(f => f.archivo);
          // "en proceso" = todavía hay filas activas o sin empezar
          const enProceso = filasAhora.some(f => {
            const est = String(f.estado || "").toLowerCase();
            return est === "procesando" || est === "subiendo" || est === "enviando" || est === "pendiente" || est === "";
          });
          // Salir solo cuando haya al menos un resultado terminal Y nadie en proceso
          const hayTerminal = filasAhora.some(f => {
            const est = String(f.estado || "").toLowerCase();
            return est === "ok" || est === "enviado" || est === "subido" || est === "completo" || est.startsWith("error");
          });
          if (!enProceso && hayTerminal) {
            await wait(4000); // pausa extra para borradores finales
            break;
          }
        }

        // Esperar a que la promesa termine (con timeout)
        await Promise.race([
          promesaProc.catch(() => {}),
          new Promise(r => setTimeout(r, 15000))
        ]);
      } catch (e) {
        return { ok: false, error: "Falló procesarTodo: " + (e.message || e) };
      }

      // 7) Recolectar resultados desde estado.filas
      const filasFinal = P.estado.filas || [];
      let okCount = 0, errCount = 0, totalCount = 0;
      const errores = [];
      for (const f of filasFinal) {
        if (!f.archivo) continue;
        totalCount++;
        const est = String(f.estado || "").toLowerCase();
        if (est === "ok" || est === "enviado" || est === "subido" || est === "completo") {
          okCount++;
        } else if (est === "error" || est.startsWith("error")) {
          errCount++;
          errores.push(`${f.nombre || f.requerimiento || "?"}: ${f.estado}${f.error ? " — " + f.error : ""}`);
        } else {
          // Estado raro/desconocido — lo cuento como error para no engañar
          errCount++;
          errores.push(`${f.nombre || f.requerimiento || "?"}: ${f.estado || "estado desconocido"}`);
        }
      }

      return { ok: true, okCount, errCount, totalCount, errores };
    },
    args: [base64Pdf, fileName, bloquesPlan]
  });
  return result || { ok: false, error: "executeScript no devolvió resultado" };
}

/**
 * Handler cuando el usuario manda "SI" después del preview de un documento.
 * Devuelve true si había un doc pendiente (lo manejó), false si no había nada.
 */
async function tgConfirmarSubidaDoc(cfg) {
  const data = await chrome.storage.local.get("matesin_tg_pendiente_doc");
  const pendiente = data.matesin_tg_pendiente_doc;
  if (!pendiente?.fileId || !pendiente?.bloques?.length) return false;

  const log = (txt) => tgEnviarMensaje(cfg.token, cfg.chatId, txt).catch(e => console.warn("[MAU] log fail", e));
  const t0 = Date.now();

  await log(`🚀 Subiendo <b>${escapeHtml(pendiente.nombreArchivo)}</b>…\n⏳ Re-bajando el PDF de Telegram…`);

  let base64;
  try {
    const r = await tgBajarArchivo(cfg.token, pendiente.fileId);
    base64 = r.base64;
  } catch (e) {
    await log(`❌ No pude re-bajar el archivo: ${escapeHtml(e.message || String(e))}`);
    return true;
  }

  let tabId;
  try {
    const tab = await tgConseguirTabBandeja();
    tabId = tab.tabId;
  } catch (e) {
    await log(`❌ Necesitás una pestaña de controldocumentario.com abierta.`);
    return true;
  }

  await log(`✅ Bandeja abierta.\n⏳ Subiendo archivos…`);

  let res;
  try {
    res = await tgDispararSubidaEnPanel(tabId, base64, pendiente.nombreArchivo, pendiente.bloques);
  } catch (e) {
    await log(`❌ Falló al subir: ${escapeHtml(e.message || String(e))}`);
    return true;
  }

  // Limpiar pendiente
  try { await chrome.storage.local.remove("matesin_tg_pendiente_doc"); } catch {}

  const tTotal = Math.round((Date.now() - t0) / 1000);

  if (!res.ok) {
    await log(`⚠️ La subida no se pudo completar:\n<i>${escapeHtml(res.error || "Razón desconocida")}</i>`);
    return true;
  }

  // Armar lista de personas de los bloques subidos
  const personas = (pendiente.bloques || []).map(b => b.meta?.apellido || "").filter(Boolean);

  if (res.errCount === 0) {
    const lineasOk = personas.map(p => `✅ Requerimiento encontrado y subido para <b>${escapeHtml(p)}</b>`);
    await log(
      `✅ <b>Todos los archivos fueron subidos correctamente</b> en ${tTotal}s.\n\n` +
      lineasOk.join("\n")
    );
  } else {
    const partes = [
      `⚠️ <b>Subida completada con errores</b> en ${tTotal}s.`,
      `📊 ${res.okCount} OK · ${res.errCount} con error · ${res.totalCount} total`,
      ""
    ];
    for (const e of (res.errores || []).slice(0, 10)) {
      partes.push(`❌ ${escapeHtml(e)}`);
    }
    await log(partes.join("\n"));
  }

  return true;
}

/**
 * Handler cuando el usuario manda "SI" después de un preview de sábana.
 */
async function tgConfirmarSubidaSabana(cfg) {
  const data = await chrome.storage.local.get("matesin_tg_pendiente_sabana");
  const pendiente = data.matesin_tg_pendiente_sabana;
  if (!pendiente || !pendiente.fileId) {
    await tgEnviarMensaje(cfg.token, cfg.chatId, "ℹ️ No tengo ninguna sábana pendiente. Mandame primero el PDF.");
    return;
  }

  const log = (txt) => tgEnviarMensaje(cfg.token, cfg.chatId, txt).catch(e => console.warn("[MAU] log fail", e));
  const t0 = Date.now();

  await log(`🚀 Arrancando subida de <b>${escapeHtml(pendiente.nombreArchivo)}</b>…\n⏳ Paso 1/4: re-bajando el PDF de Telegram…`);

  // Re-bajar el PDF original (no lo guardamos para no llenar la memoria)
  const { base64 } = await tgBajarArchivo(cfg.token, pendiente.fileId);
  await log(`✅ Bajado.\n⏳ Paso 2/4: abriendo Bandeja.aspx en el navegador…`);

  // Abrir/encontrar Bandeja
  const { tabId } = await tgConseguirTabBandeja();
  await log(`✅ Bandeja abierta.\n⏳ Paso 3/4: inyectando el PDF en el panel y disparando OCR + asignación…\n💡 Esto tarda 1-3 min según el tamaño.`);

  // Disparar el flujo en el panel — usa los bloques YA armados en Etapa 1 (sin Claude extra)
  const bloques = (pendiente.plan && Array.isArray(pendiente.plan.bloques)) ? pendiente.plan.bloques : [];
  if (!bloques.length) {
    await log(`❌ No hay bloques en el plan guardado. Mandá el PDF de nuevo.`);
    return;
  }
  let res;
  try {
    res = await tgDispararSubidaEnPanel(tabId, base64, pendiente.nombreArchivo, bloques);
  } catch (e) {
    await log(`❌ Falló al ejecutar en el panel: ${escapeHtml(e.message || String(e))}`);
    throw e;
  }

  if (!res.ok) {
    await log(`⚠️ La subida no se pudo completar:\n<i>${escapeHtml(res.error || "Razón desconocida")}</i>\n\nProbá a mano desde el panel de Bandeja.aspx.`);
    return;
  }

  const tTotal = Math.round((Date.now() - t0) / 1000);
  const partes = [
    `✅ <b>Subida terminada</b> en ${tTotal}s.`,
    `📊 ${res.okCount} OK · ${res.errCount} con error · ${res.totalCount} total`
  ];
  if (res.errores && res.errores.length) {
    partes.push("");
    partes.push("<b>Errores:</b>");
    for (const e of res.errores.slice(0, 10)) partes.push(`❌ ${escapeHtml(e)}`);
    if (res.errores.length > 10) partes.push(`…y ${res.errores.length - 10} más.`);
  }
  await log(partes.join("\n"));

  // Limpiar pendiente
  try { await chrome.storage.local.remove("matesin_tg_pendiente_sabana"); } catch {}
}

/**
 * Handler principal cuando el usuario manda un PDF al bot.
 * Manda mensajes intermedios para que se vea en qué paso va.
 */
/**
 * Lee todas las referencias de imágenes desde el IndexedDB del tab.
 * Soporta formato nuevo (imagenesPorBloque) y viejo (imagenes).
 */
async function tgLeerReferenciasConImagenes(tabId, nombresPatrones) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (nombres) => {
      function abrirDB() {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open("mau_imagedb", 1);
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = (e) => reject(e.target.error);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("patron_imagenes")) {
              db.createObjectStore("patron_imagenes", { keyPath: "nombre" });
            }
          };
        });
      }
      async function leer(db, nombre) {
        return new Promise((resolve) => {
          const tx = db.transaction("patron_imagenes", "readonly");
          const req = tx.objectStore("patron_imagenes").get(nombre);
          req.onsuccess = (e) => resolve(e.target.result || null);
          req.onerror = () => resolve(null);
        });
      }
      try {
        const db = await abrirDB();
        const refs = [];
        for (const nombre of nombres) {
          const r = await leer(db, nombre);
          if (!r) continue;
          const tieneImagenes = (r.imagenesPorBloque && Object.keys(r.imagenesPorBloque).length > 0)
            || (Array.isArray(r.imagenes) && r.imagenes.length > 0);
          if (tieneImagenes && Array.isArray(r.bloques) && r.bloques.length) {
            refs.push({
              nombre: r.nombre,
              imagenes: r.imagenes || [],
              imagenesPorBloque: r.imagenesPorBloque || null,
              bloques: r.bloques
            });
          }
        }
        db.close();
        return refs;
      } catch (e) {
        return [];
      }
    },
    args: [nombresPatrones]
  });
  return Array.isArray(result) ? result : [];
}

async function tgManejarDocumento(cfg, doc) {
  const nombreArchivo = doc.file_name || "archivo.pdf";
  const fileId = doc.file_id;
  const sizeBytes = doc.file_size || 0;
  const t0 = Date.now();
  const log = (txt) => tgEnviarMensaje(cfg.token, cfg.chatId, txt).catch(e => console.warn("[MAU] log fail", e));

  await log(`📩 <b>Documento recibido</b>: ${escapeHtml(nombreArchivo)} (${(sizeBytes / 1024).toFixed(0)} KB)\n⏳ Bajando de Telegram…`);

  // 1) Bajar el PDF
  let base64, realSize;
  try {
    const baseInfo = await tgBajarArchivo(cfg.token, fileId);
    base64 = baseInfo.base64;
    realSize = baseInfo.sizeBytes;
  } catch (e) {
    await log(`❌ No pude bajar el archivo: ${escapeHtml(e.message || String(e))}`);
    return;
  }

  // 2) Conseguir tab de Bandeja (necesaria para renderizar y luego subir)
  await log(`✅ Bajado (${(realSize / 1024).toFixed(0)} KB).\n⏳ Abriendo controldocumentario.com…`);
  let tabId, abrimosNosotros;
  try {
    const tab = await tgConseguirTabBandeja();
    tabId = tab.tabId;
    abrimosNosotros = tab.abrimosNosotros;
  } catch (e) {
    await log(`❌ Necesitás una pestaña de controldocumentario.com abierta.`);
    return;
  }

  try {
    // 3) Renderizar páginas como imágenes
    await log(`✅ Listo.\n⏳ Renderizando páginas como imágenes…`);
    let nuevasPaginas;
    try {
      nuevasPaginas = await tgRenderPdfEnImagenes(base64, tabId);
      if (!nuevasPaginas.length) throw new Error("No se renderizó ninguna página.");
    } catch (e) {
      await log(`❌ Necesitás una pestaña de controldocumentario.com abierta.\n${escapeHtml(e.message || String(e))}`);
      return;
    }

    // 4) Cargar referencias del mapeo desde IndexedDB del tab
    await log(`✅ ${nuevasPaginas.length} página(s) renderizada(s).\n⏳ Cargando mapeo guardado…`);
    const dataPatrones = await chrome.storage.local.get(KEY_PATRONES_SABANA);
    const patrones = (dataPatrones[KEY_PATRONES_SABANA] || []).filter(p => p.nombre);
    if (!patrones.length) {
      await log(`❌ No tenés ningún mapeo guardado. Hacé un mapeo primero desde "Aprender" en la extensión.`);
      return;
    }
    const referenciasDisponibles = await tgLeerReferenciasConImagenes(tabId, patrones.map(p => p.nombre));
    if (!referenciasDisponibles.length) {
      await log(`❌ Hacé un mapeo primero desde "Aprender" en la extensión.`);
      return;
    }

    // 5) Claude machea imagen vs imagen — 1 sola llamada por mapeo hasta encontrar
    await log(`⏳ Claude macheando el documento con el mapeo (${referenciasDisponibles.length} mapeo(s))…`);
    let bloquesFinales = null;
    let bloquesDescartados = [];
    for (const ref of referenciasDisponibles) {
      try {
        const resultado = await compararPaginasConReferencia(nuevasPaginas, ref);
        if (resultado?.length) {
          bloquesFinales = resultado;
          bloquesDescartados = resultado.descartados || [];
          console.log(`[MAU][TG] ✅ Macheó con "${ref.nombre}": ${resultado.length} bloque(s), ${bloquesDescartados.length} descartado(s)`);
          break;
        }
      } catch (e) {
        console.warn(`[MAU][TG] Error macheando con "${ref.nombre}":`, e);
      }
    }
    if (!bloquesFinales?.length) {
      await log(`❌ El archivo es muy distinto al mapeado, revisá que sea el correcto.`);
      return;
    }

    // 6) Guardar pendiente y pedir confirmación al usuario
    await chrome.storage.local.set({
      matesin_tg_pendiente_doc: {
        fileId,
        nombreArchivo,
        bloques: bloquesFinales,
        guardadoEn: Date.now()
      }
    });

    // Armar resumen de coincidencias para mostrar al usuario
    const lineasResumen = bloquesFinales.map(b => {
      const persona = b.meta?.apellido || "Sin nombre";
      const nPagsDoc = (b.paginas || []).length;
      const nPagsMapeo = b.paginasMapeo || nPagsDoc;
      return (
        `👤 <b>${escapeHtml(persona)}</b>\n` +
        `   Bloque original: ${nPagsMapeo} pág${nPagsMapeo !== 1 ? "s" : ""}. · Tu documento: ${nPagsDoc} pág${nPagsDoc !== 1 ? "s" : ""}. ✅ Macheado correctamente`
      );
    });

    // Mostrar también los bloques descartados por páginas incompletas
    const lineasDescartadas = bloquesDescartados.map(b => {
      const persona = b.meta?.apellido || "Sin nombre";
      const nPagsDoc = (b.paginas || []).length;
      const nPagsMapeo = b.paginasMapeo || 0;
      return (
        `👤 <b>${escapeHtml(persona)}</b>\n` +
        `   Bloque original: ${nPagsMapeo} pág${nPagsMapeo !== 1 ? "s" : ""}. · Tu documento: ${nPagsDoc} pág${nPagsDoc !== 1 ? "s" : ""}. ⚠️ Páginas incompletas — NO se sube`
      );
    });

    const parteDescartados = lineasDescartadas.length
      ? `\n\n<b>No se van a subir (páginas incompletas):</b>\n\n` + lineasDescartadas.join("\n\n")
      : "";

    await log(
      `✅ Coincidencia${bloquesFinales.length > 1 ? "s" : ""} encontrada${bloquesFinales.length > 1 ? "s" : ""}:\n\n` +
      lineasResumen.join("\n\n") +
      parteDescartados +
      `\n\n¿Lo subimos? Respondé <b>SI</b> para confirmar.`
    );

  } finally {
    if (abrimosNosotros) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

// ============================== TELEGRAM: VENCIMIENTOS =================================

// Umbral fijo: alertar siempre con vencimientos a 10 días o menos.
const TG_UMBRAL_DIAS = 10;

// Lock para que dos chequeos no corran a la vez (manual + automático, etc.)
let tgChequeoEnCurso = false;

async function tgChequearYAvisar({ forzarEnvio, visible }) {
  if (tgChequeoEnCurso) {
    console.log("[MAU] Ya hay un chequeo en curso, este se saltea.");
    return { enviado: false, skipped: true, mensaje: "Ya hay un chequeo en curso." };
  }
  tgChequeoEnCurso = true;
  try {
    return await tgChequearYAvisarInterno({ forzarEnvio, visible });
  } finally {
    tgChequeoEnCurso = false;
  }
}

async function tgChequearYAvisarInterno({ forzarEnvio, visible }) {
  const cfg = await tgGetConfig();
  if (!cfg.token || !cfg.chatId) {
    throw new Error("Falta token o Chat ID. Configuralos en Opciones.");
  }

  let extraido = await tgExtraerVencimientosDesdeTab(TG_UMBRAL_DIAS, TG_UMBRAL_DIAS, !!visible);

  // Si el sitio nos mandó al login, intentar re-loguearse con las credenciales guardadas.
  if (extraido.loginRequerido) {
    console.log("[MAU] Sesión cerrada. Intentando re-login automático…");
    const rLogin = await cdReLogin({ visible: false });

    if (rLogin.ok) {
      console.log("[MAU] Re-login OK. Reintentando extracción de vencimientos…");
      extraido = await tgExtraerVencimientosDesdeTab(TG_UMBRAL_DIAS, TG_UMBRAL_DIAS, !!visible);
    }

    // Si aún así quedó loginRequerido, o el re-login falló → avisar por Telegram.
    if (!rLogin.ok || extraido.loginRequerido) {
      const motivo = rLogin.motivo || "El sitio siguió pidiendo login después del intento.";
      const tieneCreds = !!(await chrome.storage.local.get([KEY_CD_USER, KEY_CD_PASS]))[KEY_CD_USER];
      const mensajeLogin = tieneCreds
        ? [
            "\u26a0\ufe0f <b>DocAutomatizaci\u00f3n \u2014 No pude reconectar</b>",
            "",
            `Intent\u00e9 ingresar a controldocumentario.com con los datos guardados pero fall\u00f3:`,
            `<i>${escapeHtml(motivo)}</i>`,
            "",
            "\ud83d\udc49 Revis\u00e1 el usuario/contrase\u00f1a en las Opciones de la extensi\u00f3n o logueate manualmente una vez.",
          ].join("\n")
        : [
            "\u26a0\ufe0f <b>DocAutomatizaci\u00f3n \u2014 Sesi\u00f3n cerrada</b>",
            "",
            "No pude leer los vencimientos porque controldocumentario.com pide usuario y contrase\u00f1a, y todav\u00eda no guardaste las credenciales en la extensi\u00f3n.",
            "",
            "\ud83d\udc49 Abr\u00ed las <b>Opciones</b> de la extensi\u00f3n y carg\u00e1 tu usuario y contrase\u00f1a \u2014 as\u00ed la pr\u00f3xima vez me reconecto solo.",
          ].join("\n");
      await tgEnviarMensaje(cfg.token, cfg.chatId, mensajeLogin);
      return { enviado: true, loginRequerido: true, mensaje: "Sesi\u00f3n cerrada \u2014 te avis\u00e9 por Telegram." };
    }
  }

  const items = extraido.items || [];
  const totalLeidos = extraido.totalConFecha || 0;
  // Quitar el pie (que cambia con la hora) para el dedupe
  const mensaje = tgConstruirMensaje(items, TG_UMBRAL_DIAS, TG_UMBRAL_DIAS, totalLeidos);
  const cuerpoParaHash = mensaje.split("\n\n<i>—")[0];

  const prev = await chrome.storage.local.get(KEY_TG_ULTIMO_HASH);
  const hashActual = hashRapido(cuerpoParaHash);
  const iguales = prev[KEY_TG_ULTIMO_HASH] === hashActual;

  // Si no hay cambios respecto al último aviso, no reenviar (ni cuando todo OK ni cuando hay alertas iguales).
  if (!forzarEnvio && iguales) {
    return { enviado: false, mensaje: "Sin cambios desde el \u00faltimo aviso. No se reenvi\u00f3." };
  }

  await tgEnviarMensaje(cfg.token, cfg.chatId, mensaje);
  await chrome.storage.local.set({ [KEY_TG_ULTIMO_HASH]: hashActual });
  const nP = items.filter(i => i.tipo === "personal").length;
  const nV = items.filter(i => i.tipo === "vehiculo").length;
  return {
    enviado: true,
    mensaje: nP + nV === 0
      ? "Enviado. Todo OK, no hay vencimientos pr\u00f3ximos."
      : `Enviado. Personal: ${nP} \u00b7 Veh\u00edculos: ${nV}.`
  };
}

async function obtenerApiKeyYModelo() {
  const data = await chrome.storage.local.get([KEY_API_KEY, KEY_MODELO]);
  const apiKey = data[KEY_API_KEY] || "";
  const modelo = data[KEY_MODELO] || MODELO_DEFAULT;
  if (!apiKey) throw new Error("Falta la API Key de Anthropic. Cargala en Opciones de la extensi\u00f3n.");
  return { apiKey, modelo };
}

function construirListaTipos() {
  return TIPOS_DOCUMENTO.map((t) => `- ${t.id}: ${t.desc}`).join("\n");
}

async function clasificarPaginaConClaude(base64, mediaType) {
  const { apiKey, modelo } = await obtenerApiKeyYModelo();

  const prompt = `Mir\u00e1 esta imagen de una p\u00e1gina de un PDF escaneado. Es documentaci\u00f3n laboral argentina (empresa Matesin Claudio Fabi\u00e1n, CUIT 20-20999512-4) que va a subirse al sistema controldocumentario.com para el cliente BUNGE.

IMPORTANTE: El documento puede estar ROTADO o escaneado de costado (90\u00b0 o 180\u00b0). Le\u00e9 el texto en cualquier orientaci\u00f3n que aparezca. No te confundas por la rotaci\u00f3n.

PASO 1 \u2014 Identific\u00e1 el tipo de documento. Le\u00e9 atentamente el T\u00cdTULO y CONTENIDO COMPLETO de la p\u00e1gina antes de clasificar. No te apures \u2014 mir\u00e1 toda la imagen:
${construirListaTipos()}

REGLAS CLAVE PARA CLASIFICAR:
* Si ves "ENTREGA DE ROPA DE TRABAJO Y ELEMENTOS DE PROTECCI\u00d3N PERSONAL" o "Resoluci\u00f3n 299/11" o una tabla con productos como casco, botines, guantes, lentes, camisa, pantal\u00f3n, chaleco \u2192 es "entrega_epp".
* Si ves "Planilla de asistencia" o "capacitaci\u00f3n" \u2192 es "capacitacion".
* Si ves una tabla con conceptos como jubilaci\u00f3n, ley 19032, sindical, hs trabajadas \u2192 es "recibo_haberes".
* P\u00e1gina con logo ARCA + recuadro "931" + tablas "REGIMEN NACIONAL DE SEGURIDAD SOCIAL" \u2192 es "f931". Es el formulario de declaraci\u00f3n jurada, nunca un ticket de banco.
* Banco Provincia "Pago" + "N\u00famero de VEP" + impuestos con c\u00f3digos 351/301/352/302/312 (contribuciones y aportes seg. social) \u2192 es "pago_f931". Estos c\u00f3digos son la se\u00f1al definitiva.
* Banco Provincia "Pago" + dice "Nombre del Ente Abonado: UOCRA" (o "UOCRA - Online") \u2192 es "pago_uocra". Ning\u00fan otro ticket tiene UOCRA como ente abonado.
* Banco Provincia "Nueva transferencia" + campo Referencia dice "VAR f.Desempleo" \u2192 es SIEMPRE "transferencia_desempleo". NUNCA "pago_f931". Son documentos distintos: uno tiene c\u00f3digos de impuestos (351/301/312), el otro tiene "Titular cuenta destino" y referencia "VAR f.Desempleo".
* NO confundas planillas de EPP con recibos de sueldo o transferencias.

PASO 2 \u2014 Extra\u00e9 datos del EMPLEADO (no de la empresa):
- cuil: CUIL o CUIT del EMPLEADO. Reglas:
  * NUNCA pongas 20-20999512-4 / 20209995124 / CLAUDIO FABIAN MATESIN \u2014 ese es el titular de la empresa y NO es un empleado (EXCEPTO si el empleado se llama MATESIN GENARO, que s\u00ed es empleado).
  * En recibos de sueldo: el CUIL est\u00e1 junto al apellido/nombre del trabajador.
  * En transferencias bancarias: el empleado es el del campo "Titular cuenta destino", NO "Titular". Extra\u00e9 el CUIL de ah\u00ed. Puede estar sin guiones (ej: 20277427053 \u2192 20-27742705-3).
  * En planillas de EPP (entrega_epp): el empleado est\u00e1 en el campo "Nombre y Apellido del Trabajador". El CUIL/DNI puede estar en el campo "D.N.I." o "C.U.I.T.".
  * Si no ves claramente el CUIL del empleado, dejalo vac\u00edo.
- apellido: apellido del EMPLEADO. En planillas EPP sacalo de "Nombre y Apellido del Trabajador". Si dice "Genaro Matesin" \u2192 apellido "MATESIN", nombre "GENARO".
- nombre: nombre del EMPLEADO.
- patente: patente del veh\u00edculo (ABC123 o AB123CD) solo si es seguro automotor.
- periodo: per\u00edodo en formato YYYY-MM si aparece.
- textoEstable: entre 5 y 12 palabras clave estables que identifiquen ESTE documento y ESTA persona espec\u00edfica. Inclu\u00ed nombre/apellido del empleado, t\u00edtulo del formulario o tipo de documento, empresa si es relevante. EXCLU\u00cd: fechas, montos, n\u00fameros de transacci\u00f3n, VEP, per\u00edodos, CBU. Ejemplo: "LOPEZ JUAN RECIBO HABERES MATESIN" o "GOMEZ PEDRO ENTREGA EPP RESOLUCI\u00d3N 299" o "RODRIGUEZ ANA DECLARACI\u00d3N F931 BUNGE".

Respond\u00e9 SOLO con un JSON v\u00e1lido (sin markdown, sin explicaciones, sin bloques de c\u00f3digo):
{"id":"xxx","cuil":"","apellido":"","nombre":"","patente":"","periodo":"","textoEstable":""}

Si un dato no aplica o no aparece, dejalo como "". Si no pod\u00e9s identificar el tipo, us\u00e1 "desconocido".`;

  const body = {
    model: modelo,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt }
        ]
      }
    ]
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const json = await resp.json();
  const textoRespuesta = (json?.content?.[0]?.text || "").trim();

  let parsed = null;
  try {
    parsed = JSON.parse(textoRespuesta);
  } catch (_e) {
    const m = textoRespuesta.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (_e2) { parsed = null; }
    }
  }

  const idCrudo = String(parsed?.id || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const tipo = TIPOS_DOCUMENTO.find((t) => t.id === idCrudo);
  const id = tipo ? tipo.id : "desconocido";
  const etiqueta = tipo ? tipo.etiqueta : "";
  return {
    id,
    etiqueta,
    cuil: String(parsed?.cuil || "").trim(),
    apellido: String(parsed?.apellido || "").trim(),
    nombre: String(parsed?.nombre || "").trim(),
    patente: String(parsed?.patente || "").trim(),
    periodo: String(parsed?.periodo || "").trim(),
    textoEstable: String(parsed?.textoEstable || "").trim(),
    raw: textoRespuesta
  };
}

async function probarConexionClaude() {
  const { apiKey, modelo } = await obtenerApiKeyYModelo();
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 10,
      messages: [{ role: "user", content: "Responde solo con la palabra OK" }]
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const json = await resp.json();
  const texto = (json?.content?.[0]?.text || "").trim();
  return { ok: true, respuesta: texto, modelo };
}