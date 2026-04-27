# Control-Matesin — Estado del proyecto (para Claude)

## Qué es esto
Extensión de Chrome (Manifest V3) que automatiza la subida de documentos PDF a controldocumentario.com para la empresa Matesin. Usa Claude API (claude-haiku-4-5) para identificar documentos y asignarlos a las personas correctas.

## Archivos clave

| Archivo | Rol |
|---|---|
| `background.js` | Service worker. Maneja API Claude, Telegram, renderizado de PDFs, comparación de imágenes |
| `panel.js` | UI del panel en controldocumentario.com. Procesamiento local de archivos |
| `imagedb.js` | IndexedDB `mau_imagedb` — guarda imágenes de referencia del mapeo |
| `storage.js` | Puente entre panel.js y background.js (mensajes postMessage) |
| `ocr-engine.js` | Renderiza páginas PDF a imágenes (base64) y extrae texto con Claude |
| `modal-seleccion.js` | Modal visual para el mapeo (Aprender) |
| `matcher.js` | Lógica de matching de patrones de texto |

## Flujo principal — cómo funciona

### Aprender (mapear)
1. Usuario sube una sábana PDF al panel
2. `modal-seleccion.js` muestra thumbnails de páginas para asignar bloques
3. Claude (via `extraerTextoPorPagina`) lee CUIL, apellido, nombre de cada página
4. Se guarda en `chrome.storage` (patrón con `bloquesModal`, `firmaTipos`) y en IndexedDB (imágenes por bloque via `MAUImageDB.guardarImagenesPatron`)
5. Cada bloque guarda: `nombre`, `paginas`, `requerimientos` (fila de CD a subir), `meta` (apellido, nombre, cuil)

### Trabajar (subir documentos)
1. Usuario sube PDF nuevo
2. `renderizarPaginas` convierte cada página a imagen base64
3. `compararPaginasConReferencia` (1 sola llamada Claude) compara imágenes nuevas vs referencia:
   - Claude lee el CUIL de cada página nueva
   - Código valida CUIL vs bloques de referencia (indexado por posición, no por nombre)
   - Devuelve bloques con `{ nombre, paginas, requerimientos, meta }`
4. `asignarArchivoARequerimiento` asigna el PDF cortado a la fila correcta de CD:
   - Usa **nombre completo** (`apellido + nombre`) para distinguir personas con mismo apellido
   - Ej: "FERNANDEZ DIEGO ARIEL" vs "FERNANDEZ ENRIQUE DARIO"

### Telegram
- `tgManejarDocumento` — mismo flujo que local: descarga → renderiza → compara → asigna
- `tgLeerReferenciasConImagenes` — lee IndexedDB desde el tab de controldocumentario.com
- `tgRenderPdfEnImagenes` — renderiza PDF en el contexto del tab

## Decisiones de arquitectura importantes

### 1 sola llamada a Claude para matching
Se usa 1 llamada donde Claude ve TODAS las referencias + TODAS las páginas nuevas. Claude lee el CUIL de cada página. El código valida CUIL y reasigna si Claude se equivocó de bloque.

### Claude recibe TODAS las imágenes de cada bloque
En `compararPaginasConReferencia`, por cada bloque de referencia se mandan a Claude TODAS las páginas que ese bloque tiene en el mapeo (no solo la primera). Esto es crítico para bloques con múltiples tipos de formulario (ej: recibo + VAR f.Desempleo). Claude debe poder reconocer cualquier formulario del bloque, no solo el tipo de la primera página.

El campo `imagenesRef` (array) reemplaza a `base64Ref` (string único). El fallback a `imagenesPorBloque` (formato legacy, 1 sola imagen) se mantiene para compatibilidad.

### Clave del Map es el ÍNDICE, no el nombre
Los bloques en el mapeo se llaman todos "Bloque" (nombre por defecto del modal). Si se usara el nombre como clave del Map, todos colapsarían. Se usa el índice en `bloquesRef` como clave.

### parsearRecurso usa nombre completo como apellido
En panel.js, `parsearRecurso()` extrae el nombre completo del empleado (ej: "FERNANDEZ DIEGO ARIEL") y lo guarda entero en `recurso.apellido`. Antes solo guardaba la primera palabra.

### Matching de persona usa apellido + nombre
En `asignarArchivoARequerimiento`, para elegir la fila correcta entre múltiples personas con el mismo apellido, se construye `metaNombreCompleto = apellido + " " + nombre` desde la metadata del bloque.

## Bugs resueltos (no volver atrás)
- Bloques colapsaban en Map por nombre genérico "Bloque" → usar índice como clave
- parsearRecurso devolvía solo primera palabra → ahora nombre completo
- Match de persona usaba solo apellido → ahora apellido + nombre completo
- Fallback de período no usaba recurso para filtrar → ahora prefiere filas con persona
- tgRenderPdfEnImagenes devolvía `[base64]` no `[{pagina, base64}]` → corregido
- FERNANDEZ DIEGO vs FERNANDEZ ENRIQUE se confundían → solucionado con nombre completo en parsearRecurso + metaNombreCompleto en asignarArchivoARequerimiento
- Bloque de 3 páginas subía solo 2 → Claude recibía solo 1 imagen de referencia por bloque (la primera página). Corregido: ahora se mandan TODAS las imágenes del bloque. Claude puede reconocer cualquier formulario del bloque, no solo el primero.

## Cosas que NO hacer
- No agregar clasificación de documentos por texto (TIPOS_DOCUMENTO está en background.js pero NO se usa para el flujo principal de matching — solo el mapeo visual manda)
- No agregar llamadas extra a Claude por página (costo)
- No cambiar el flujo de 1 llamada a multi-llamada
- No confundir el CUIL del empleado (en el documento) con el CUIL del empleador (en las filas de CD, que es siempre el de Matesin). En los documentos aparece el CUIL del empleador impreso como empresa — si Claude lee ese CUIL y no matchea ningún bloque, NO descartar la página: confiar en el match visual. Solo redirigir si el CUIL leído matchea un bloque DIFERENTE al que asignó Claude.
- NO descartar bloques válidos de otras personas si una persona tiene páginas faltantes. La validación es POR BLOQUE, no global.
- No agregar chain-of-thought al prompt de Claude para matching — empeora las asignaciones porque Claude se convence a sí mismo de cosas incorrectas. El prompt debe ser directo y simple.

## Reglas de negocio importantes
- **El mapeo manda**: si una página coincide visualmente con un bloque del mapeo, se sube. Si no coincide, no se sube. No hay fallback por texto ni por tipo de documento.
- **Listas cortas son válidas**: si el PDF tiene 3 personas de las 10 del mapeo, se suben esas 3. No es error.
- **Si falta una página de un bloque**: el bloque se DESCARTA completo. Si el mapeo dice que ese bloque tiene 3 páginas y solo se encontraron 2, no se sube nada de ese bloque. El usuario debe subir el PDF completo para ese bloque.
- **La validación es por bloque, no global**: si MATESIN tiene las 3 páginas completas y FERNANDEZ solo tiene 2 de 3, MATESIN se sube igual y FERNANDEZ se descarta.
- **CUIL como validación, no como matching principal**: Claude hace el match visual, el código valida/corrige con CUIL si hay discrepancia.

## Estado actual
- Matching por imagen + CUIL: funcionando
- Asignación por persona (apellido completo): funcionando ✓ (FERNANDEZ DIEGO vs FERNANDEZ ENRIQUE resuelto)
- Telegram: mismo flujo que local
- Vehículos: usan patente como identificador (no apellido), funciona aparte
- Log debug en panel.js (`[MAU][DEBUG]`): hay logs temporales de diagnóstico que se pueden limpiar

## Para continuar
Si algo no funciona, pedir los logs del DevTools:
- Panel (bandeja de CD): DevTools del tab de controldocumentario.com (F12) → Console
- Background (comparación Claude): chrome://extensions → service worker → Console
