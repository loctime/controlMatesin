# Matesin Auto-Upload (Chrome)

Esta carpeta ya viene lista para cargar como extensión de Chrome.

## Cómo instalarla (paso a paso)

1. Descargá o copiá esta carpeta completa en tu PC.
2. Abrí Google Chrome.
3. En la barra de direcciones escribí: `chrome://extensions` y apretá Enter.
4. Activá el interruptor **Modo desarrollador** (arriba a la derecha).
5. Hacé click en **Cargar descomprimida**.
6. Seleccioná esta carpeta: `matesin-auto-upload`.
7. Listo: vas a ver el ícono de la extensión en Chrome.

## Cómo usarla en controldocumentario.com

1. Entrá a `https://controldocumentario.com/Bandeja.aspx?menu=1`.
2. Vas a ver un panel a la derecha llamado **Matesin Auto-Upload**.
3. Hacé click en **Detectar requerimientos pendientes**.
4. Arrastrá tus PDFs al área de carga.
5. Revisá la tabla de asignaciones.
6. Hacé click en **Procesar todo**.
7. Confirmá cada envío (o elegí **Sí a todos**).

## Opciones

- Para borrar el aprendizaje de mapeos:
  - En `chrome://extensions`, buscá **Matesin Auto-Upload**.
  - Entrá a **Detalles** > **Opciones de extensión**.
  - Hacé click en **Limpiar memoria**.

## Re-login automático (nuevo)

Si la extensión detecta que se cerró tu sesión en controldocumentario.com, puede volver a loguearse sola sin que tengas que abrir la página.

Para activarlo:

1. Entrá a las **Opciones** de la extensión.
2. Completá **Usuario** y **Contraseña** de controldocumentario.com.
3. Hacé click en **Guardar** y luego en **Probar login** para confirmar que funciona.

Desde ese momento, si tu sesión se corta (por ejemplo mientras la extensión está chequeando vencimientos), vuelve a entrar automáticamente. Si el login falla (contraseña vieja, sitio caído), te llega un aviso por Telegram.

Los datos se guardan solo en tu Chrome, en tu PC. No se envían a ningún servidor externo.

## Notas

- La extensión solo se activa en `controldocumentario.com`.
- Si la página tarda en cargar, la extensión reintenta automáticamente los pasos críticos.
