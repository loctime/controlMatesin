/**
 * MAUImageDB — almacenamiento de imágenes de referencia en IndexedDB.
 * Se usa para guardar las páginas del PDF cuando se hace el mapeo (Aprender),
 * y para recuperarlas cuando se comparan con nuevos documentos (Trabajar).
 * IndexedDB no tiene límite práctico de tamaño, a diferencia de chrome.storage.local.
 */
(function () {
  const DB_NAME = "mau_imagedb";
  const DB_VERSION = 1;
  const STORE = "patron_imagenes";

  function abrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "nombre" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Guarda las imágenes de referencia de un patrón.
   * @param {string} nombrePatron - Nombre del patrón (mismo que en chrome.storage).
   * @param {{ imagenes: Array<{pagina:number, base64:string}>, bloques: Array }} datos
   */
  async function guardarImagenesPatron(nombrePatron, datos) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ nombre: nombrePatron, ...datos, guardadoEn: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  /**
   * Lee las imágenes de referencia de un patrón.
   * @param {string} nombrePatron
   * @returns {Promise<{imagenes, bloques}|null>}
   */
  async function leerImagenesPatron(nombrePatron) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(nombrePatron);
      req.onsuccess = (e) => {
        db.close();
        const r = e.target.result;
        if (!r) { resolve(null); return; }
        resolve({
          nombre: r.nombre,
          imagenes: r.imagenes || [],
          imagenesPorBloque: r.imagenesPorBloque || null,
          bloques: r.bloques || []
        });
      };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  /**
   * Lista los nombres de todos los patrones con imágenes guardadas.
   * @returns {Promise<string[]>}
   */
  async function listarPatrones() {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAllKeys();
      req.onsuccess = (e) => { db.close(); resolve(e.target.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  /**
   * Elimina las imágenes de referencia de un patrón.
   * @param {string} nombrePatron
   */
  async function eliminarImagenesPatron(nombrePatron) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(nombrePatron);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  window.MAUImageDB = {
    guardarImagenesPatron,
    leerImagenesPatron,
    listarPatrones,
    eliminarImagenesPatron
  };
})();
