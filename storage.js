(function () {
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

  async function guardarPatronesSabana(lista) {
    await enviarMensajeExtension({ action: "storage:guardarPatronesSabana", payload: lista });
  }

  async function matchearConMapeo(paginasClasificadas) {
    return enviarMensajeExtension({ action: "ai:matchearConMapeo", payload: { paginasClasificadas } });
  }

  async function compararConReferencia(nuevasPaginas, referencia) {
    return enviarMensajeExtension({ action: "ai:compararConReferencia", payload: { nuevasPaginas, referencia } });
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
    guardarPatronesSabana,
    limpiarPatronesSabana,
    matchearConMapeo,
    compararConReferencia,
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