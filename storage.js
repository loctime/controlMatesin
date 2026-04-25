(function () {
  // ===================== MAPEOS ESTRUCTURADOS =====================
  // Cada mapeo guarda: tipoDoc, persona, cuil, patente, textoEstable, requerimiento.
  // Se usan para identificar documentos futuros sin depender del nombre del archivo.

  const KEY_MAPEOS_V2 = "matesin_mapeos_v2";

  async function leerMapeos() {
    return enviarMensajeExtension({ action: "storage:leerMapeosV2" });
  }

  async function guardarMapeo(mapeo) {
    return enviarMensajeExtension({ action: "storage:guardarMapeoV2", payload: mapeo });
  }

  async function eliminarMapeo(indice) {
    return enviarMensajeExtension({ action: "storage:eliminarMapeoV2", payload: { indice } });
  }

  async function leerMemoria() {
    return enviarMensajeExtension({ action: "storage:getMemory" });
  }

  async function guardarMemoria(obj) {
    await enviarMensajeExtension({ action: "storage:setMemory", payload: obj || {} });
  }

  async function aprenderPatron(nombreArchivo, requerimiento) {
    await enviarMensajeExtension({
      action: "storage:learnPattern",
      payload: { nombreArchivo, requerimiento }
    });
  }

  async function limpiarMemoria() {
    await enviarMensajeExtension({ action: "storage:clearMemory" });
  }

  async function leerPatronesSabana() {
    return enviarMensajeExtension({ action: "storage:leerPatronesSabana" });
  }

  async function guardarPatronSabana(payload) {
    await enviarMensajeExtension({ action: "storage:guardarPatronSabana", payload });
  }

  async function limpiarPatronesSabana() {
    await enviarMensajeExtension({ action: "storage:limpiarPatronesSabana" });
  }

  function normalizar(texto) {
    return (texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  window.MAUStorage = {
    leerMemoria,
    guardarMemoria,
    aprenderPatron,
    limpiarMemoria,
    leerPatronesSabana,
    guardarPatronSabana,
    limpiarPatronesSabana,
    leerMapeos,
    guardarMapeo,
    eliminarMapeo,
    normalizar
  };

  function enviarMensajeExtension(payload) {
    return new Promise((resolve, reject) => {
      const requestId = `mau-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
          reject(new Error(data.response?.error || "Error desconocido en background."));
          return;
        }
        resolve(data.response.data);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ __mauTipo: "MAU_TO_EXTENSION", requestId, payload }, "*");
    });
  }
})();