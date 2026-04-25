# Prompt para Cursor — Extensión de Chrome "Matesin Auto-Upload"

Copiá TODO lo que está abajo de la línea y pegalo en el chat de Cursor. Decile: "creá esta extensión completa, todos los archivos, lista para cargar en Chrome".

---

Quiero que crees una **extensión de Chrome (Manifest V3)** llamada **"Matesin Auto-Upload"** que automatiza la subida de documentos a la plataforma `controldocumentario.com` para el cliente MATESIN CLAUDIO FABIAN, empresa destino BUNGE.

## Contexto del problema
El usuario debe subir muchos PDFs por mes a requerimientos pendientes en `https://controldocumentario.com/Bandeja.aspx?menu=1`. Cada requerimiento tiene un nombre (ej: "F 931", "Nómina F 931", "Cláusula no repetición", "Seguro de vida obligatorio", etc.) y necesita un PDF adjunto. El flujo manual es lento: abrir requerimiento → adjuntar archivo → continuar → enviar → volver → siguiente.

El diálogo nativo "Choose File" de Windows NO funciona con automatización (queda bajo el proceso Chrome y bloquea clicks). La única vía probada que funciona es **inyectar el archivo como `File` object directamente en el `input[type=file]` del DOM**, usando `DataTransfer` y disparando un evento `change`.

## Estructura del DOM (CRÍTICO)
El popup de "Adjuntar archivo" vive en un **iframe doblemente anidado**:
1. `iframe.fancybox-iframe` (popup del Detalle del Requerimiento)
2. Adentro hay otro `iframe` (popup del adjuntar archivo)
3. Adentro de ese está el `input[type="file"]`

## Funcionalidades requeridas

### 1. Detección automática
- La extensión se activa solo en `controldocumentario.com`.
- Cuando el usuario está en el Área de Trabajo (`/Bandeja.aspx`), inyecta un panel flotante a la derecha llamado **"Matesin Auto-Upload"**.

### 2. Panel flotante
El panel debe tener:
- Header con logo/texto "Matesin Auto-Upload" y botón minimizar.
- **Zona drag-and-drop** grande para arrastrar PDFs desde el explorador de Windows.
- Botón **"Detectar requerimientos pendientes"** que hace click en el botón "Buscar" verde de la página y luego lee la lista de requerimientos pendientes (estado "Pend envío") y los muestra en una tabla dentro del panel.
- Tabla con columnas: `Requerimiento | Archivo asignado | Estado`.
- Botón grande **"Procesar todo"** abajo.

### 3. Manejo de PDFs sábana (varios docs en un solo PDF)
Cuando el usuario arrastra un PDF de más de 3 páginas:
- Mostrar un modal con miniaturas de cada página (usar `pdf.js` desde CDN).
- Al lado de cada página, un dropdown con la lista de requerimientos pendientes.
- El usuario marca "página 1-2 → Cláusula no repetición", "página 3 → ART nómina", etc.
- Botón "Dividir y mapear" que usa `pdf-lib` (CDN) para partir el PDF en partes y asignarlas a los requerimientos.

### 4. Mapeo automático por nombre
Cuando el usuario arrastra varios PDFs sueltos:
- Comparar cada nombre de archivo con cada requerimiento pendiente.
- Usar matching difuso (similitud de strings) con palabras clave del skill:
  - "F931", "F 931", "formulario931" → requerimiento que contenga "F 931"
  - "nomina", "nómina" → "Nómina F 931"
  - "sindicales", "aportes" → "Pago aportes sindicales"
  - "capacitacion", "asistencia" → "Planilla de capacitación"
  - "credencial", "grua" → "Credencial op. gruas"
  - "seguro", "poliza", "responsabilidad" → "Seguro de responsabilidad civil"
  - "clausula", "no repeticion" → "Cláusula no repetición"
  - "ART nomina", "certificado afiliacion" → "Constancia ART con nómina"
  - "vida obligatorio", "decreto 1567" → "Seguro de vida obligatorio"
  - "automotor", patente (UMM906, HTC822, etc.) → "Seguro Automotor patente XXX"
  - "tecnico", patente → "Seguro Técnico patente XXX"
- Para los seguros automotor/técnico de vehículos: el MISMO archivo se sube a los DOS requerimientos de la patente.
- Los matches se muestran en la tabla. El usuario puede corregir manualmente con un dropdown.

### 5. Memoria / aprendizaje
- Guardar en `chrome.storage.local` el historial de mapeos: `{ patternNombreArchivo: nombreRequerimiento }`.
- La próxima vez, sugerir primero los matches aprendidos antes que el matching difuso.
- Botón "Limpiar memoria" en las opciones de la extensión.

### 6. Procesamiento automático
Al hacer click en **"Procesar todo"**:
1. Para cada par `(requerimiento, archivo)` mapeado:
   a. Hacer click en el nombre del requerimiento para abrir el fancybox.
   b. Esperar que cargue el iframe.
   c. Ejecutar dentro del iframe el click en "Adjuntar archivo".
   d. Esperar el segundo iframe.
   e. Inyectar el `File` en el `input[type=file]` usando `DataTransfer` y disparar `change`.
   f. Esperar el mensaje "Archivo cargado con éxito".
   g. Click en "Continuar".
   h. **MOSTRAR MODAL DE CONFIRMACIÓN** "¿Enviar este requerimiento? Esta acción es irreversible" con botones Sí/No/Sí a todos.
   i. Si confirma → click en "Enviar". Si no → "Volver" y pasar al siguiente.
2. Mostrar barra de progreso arriba del panel: "Procesando 3 de 12...".
3. Al terminar, mostrar resumen: cuántos enviados OK, cuántos saltados, cuántos con error.

### 7. Snippet de inyección (probado, funciona — usalo tal cual)
```javascript
async function inyectarArchivo(file) {
  const iframe1 = document.querySelector('iframe.fancybox-iframe');
  const doc1 = iframe1.contentDocument || iframe1.contentWindow.document;
  const iframe2 = doc1.querySelector('iframe');
  const doc2 = iframe2.contentDocument || iframe2.contentWindow.document;
  const fi = doc2.querySelector('input[type="file"]');
  const dt = new DataTransfer();
  dt.items.add(file);
  fi.files = dt.files;
  fi.dispatchEvent(new Event('change', {bubbles: true}));
}
```

Y para clickear "Adjuntar archivo" dentro del fancybox:
```javascript
function clickAdjuntar() {
  const iframe = document.querySelector('iframe.fancybox-iframe');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  const links = doc.querySelectorAll('a');
  const adjuntar = Array.from(links).find(a => a.textContent.trim() === 'Adjuntar archivo');
  adjuntar.click();
}
```

## Estructura de archivos esperada
```
matesin-auto-upload/
├── manifest.json          (Manifest V3)
├── background.js          (service worker)
├── content.js             (se inyecta en controldocumentario.com)
├── panel.html             (HTML del panel flotante)
├── panel.css              (estilos del panel)
├── panel.js               (lógica del panel: drag-drop, tabla, procesamiento)
├── pdf-splitter.js        (lógica de partir PDFs sábana con pdf-lib)
├── matcher.js             (matching difuso de nombres → requerimientos)
├── storage.js             (lectura/escritura de memoria de mapeos)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              (cómo cargar la extensión en Chrome paso a paso)
```

## Manifest V3 — permisos necesarios
- `activeTab`
- `storage`
- `scripting`
- host_permissions: `https://controldocumentario.com/*`

## Estilo visual
- Panel flotante con esquinas redondeadas, sombra suave.
- Colores: verde BUNGE (#00853e) como acento, fondo blanco, texto gris oscuro.
- Tipografía sans-serif moderna (system-ui).
- Botones grandes y claros.
- Tabla con filas alternadas.
- Estado de cada fila con badge de color: gris (pendiente), amarillo (procesando), verde (enviado), rojo (error).

## Entregables
1. Todos los archivos de la extensión, listos para cargar en Chrome.
2. Un `README.md` con instrucciones SIN tecnicismos para una persona que no programa:
   - Cómo descargar/clonar la carpeta.
   - Cómo abrir `chrome://extensions`.
   - Cómo activar "Modo desarrollador".
   - Cómo hacer click en "Cargar descomprimida" y seleccionar la carpeta.
   - Cómo aparece el ícono y cómo usarla.

Importante: el código debe estar comentado en español, los nombres de variables claros, y no debe romper si la página tarda en cargar (usar `MutationObserver` o `setTimeout` con reintentos donde haga falta).

---

Fin del prompt.
