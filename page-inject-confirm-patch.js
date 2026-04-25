/**
 * Corre en el MUNDO DE LA PÁGINA (MAIN) para que window.confirm del sitio
 * pueda aceptarse automáticamente sin bloquear la automatización.
 */
(function () {
  if (window.__mauParcheConfirmInstalado) return;
  window.__mauParcheConfirmInstalado = true;

  const confirmOriginal = window.confirm.bind(window);

  window.confirm = function (mensaje) {
    const m = String(mensaje || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Tras quitar tildes, "enviará" queda "enviara".
    const autoOk =
      m.includes("se enviara") ||
      (m.includes("enviar") && m.includes("requerimiento")) ||
      m.includes("1 requerimiento");

    if (autoOk) {
      console.log("[MAU] window.confirm aceptado automáticamente (OK):", mensaje);
      return true;
    }

    return confirmOriginal(mensaje);
  };
})();
