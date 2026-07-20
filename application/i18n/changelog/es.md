# Registro de cambios


## [0.5.11] - 2026-07-20

### Mejoras
- **Renovación de la UI del cliente alineada al tema**: el chrome de la app, la barra lateral/escenario del vault, la ventana de ajustes y los componentes UI compartidos siguen el tema activo con más claridad — navegación con acento primario, superposiciones tipo cristal, elevación más suave y foco/profundidad refinados en botones, entradas, diálogos, pestañas, interruptores, estados vacíos y paneles laterales

## [0.5.10] - 2026-07-19

### Correcciones
- **Superposición del diálogo «Novedades» demasiado oscura**: el diálogo «Novedades» oscurecía tanto la ventana de Ajustes que la navegación izquierda era casi ilegible; ahora se reducen la opacidad y el desenfoque de su superposición para que la navegación de detrás siga siendo legible (solo afecta a este diálogo)

## [0.5.9] - 2026-07-19

### Correcciones
- **No se podía cerrar el diálogo**: los diálogos abiertos en la ventana de Ajustes (p. ej., el registro de «Novedades») no se podían cerrar: la X de la esquina superior derecha se solapaba con la zona de arrastre de la barra de título, por lo que los clics se interpretaban como arrastre de la ventana. Ahora todos los diálogos quedan excluidos de esa zona y la X cierra de forma fiable

## [0.5.8] - 2026-07-19

### Seguridad
- **Refuerzo del IPC de archivos locales**: los manejadores IPC de lectura/escritura/eliminación/enumeración de archivos locales ahora validan el sender del renderer que llama y rechazan contextos webview/invitado, de modo que un XSS del renderer no pueda escalar a acceso arbitrario a archivos locales (defensa en profundidad)
- **Refuerzo de dependencias**: resueltos todos los avisos de severidad alta del árbol de dependencias de producción: fast-uri → 4.1.1, fast-xml-parser → 5.10.1, fast-xml-builder → 1.3.0, hono → 4.12.31; y, acotado al subárbol de @cursor/sdk, node-gyp → 11.4.2 y tar → 7.5.20 (con alcance limitado para no afectar las compilaciones nativas)

## [0.5.7] - 2026-07-18

### Funciones
- **Informes de fallos anónimos (opcional)**: desactivado por defecto; al activarlo en Ajustes → Sistema, se envían resúmenes de fallos depurados (sin rutas, nombres de usuario, hosts ni datos de sesión) para corregir fallos más rápido

## [0.5.6] - 2026-07-18

### Seguridad
- **Cabecera de autenticación de inventario HTTP cifrada**: la cabecera de autenticación (Authorization / clave de API) de las fuentes json_http ya no se almacena en texto plano; ahora usa cifrado a nivel de campo del vault, y los valores en texto plano existentes se migran en el primer inicio tras la actualización
- **Refuerzo de dependencias**: undici → 6.27.0, DOMPurify → 3.4.12, uuid → 13.0.2, corrigiendo avisos de XSS alcanzable y request smuggling / DoS que los overrides obsoletos aún cumplían

## [0.5.5] - 2026-07-18

### Correcciones
- **Toasts falsos de «Error en la actualización»**: los errores de la fase de comprobación ya no se tratan como fallos de descarga; se limpia el estado in-flight tras cada comprobación IPC
- **Canal de actualización Windows arm64**: usar `latest-arm64.yml` para no descargar instaladores x64
- **Ruta de comprobación/descarga más fiable**: dual-feed y máquina de estados de UI reducen errores falsos por comprobaciones concurrentes

## [0.5.4] - 2026-07-18

### Seguridad
- **Límite de desbloqueo del Vault**: desactivar/cambiar PIN y WebAuthn requieren desbloqueo o PIN actual; límite de intentos
- **Diagnóstico/salud SSH**: abortar antes de autenticar si la clave del host es unknown/changed para no ofrecer contraseñas a un MITM
- **Seguimiento de sesión**: sellado AES-GCM E2E con token de invitación; relay opaco; rechazo de wss/ws falsos
- **IPC de credenciales**: validar el sender en desbloqueo del vault y en encrypt/decrypt
- **Temp / RDP / deep links / logs / adjuntos de IA**: 0700+symlink-safe, limpieza inmediata de cmdkey si falla RDP, confirmación Telnet/JMS, sin logs de respuestas kbd-int, límites de tamaño de adjuntos

### Correcciones
- Health con keyboard-interactive; notas con scroll
- Envío de IA solo con adjuntos; SFTP/port-forward honran verifyHostKeys

### Ingeniería
- Añadir `npm run typecheck`; primera tanda de errores de tipos de producción (vault/WebAuthn/update/SFTP)

## [0.5.3] - 2026-07-18

### Correcciones
- **Desplazamiento del diálogo de novedades**: las notas largas se pueden desplazar dentro del diálogo

### Mejoras
- Texto del recuento de cambios de la última versión corregido; cadenas de «Novedades» completadas en los 10 idiomas de la interfaz

## [0.5.2] - 2026-07-18

### Funciones
- **Vault de equipo local-first**: paquetes de inventario solo con metadatos, roles (owner/editor/viewer) y auditoría firmada HMAC; contraseñas y claves privadas no salen del dispositivo
- **Seguimiento de sesión por relé WAN**: relé TCP NDJSON apto para NAT; relé local embebido o `scripts/follow-relay.cjs` autoalojado
- **Desbloqueo del Vault con passkey del dispositivo**: autenticadores WebAuthn (Touch ID / Windows Hello / llave de seguridad) verificados en el proceso principal; no es sync multi-dispositivo en la nube
- **KEX poscuántico híbrido ssh2 integrado**: prefiere `mlkem768x25519-sha256` y vuelve a algoritmos clásicos si no hay soporte
- **Soporte de hosts RDP**: lanza el cliente de escritorio remoto del sistema desde el Vault (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Salto y proxy OpenSSH del sistema**: cadenas de jump y proxies HTTP/SOCKS en sesiones OpenSSH del sistema

### Mejoras
- **Actualización global de componentes UI**: radios, sombras suaves y anillos de foco unificados en botones, entradas, popovers, paneles laterales, estados vacíos y toasts
- **Panel lateral de IA pulido**: diseño de Q&A, controles de modelo/permiso, spinner de pensamiento cuadrado y tipografía de entrada
- **Diálogo de changelog rediseñado**: versiones plegables, color por sección y notas según el idioma de la UI

## [0.5.0] - 2026-07-17

### Funciones
- **Panel de diagnóstico de flujo Hex/Raw del terminal**: activación opcional para inspeccionar byte a byte la entrada/salida cruda de la sesión, útil para depurar problemas de codificación y secuencias de escape
- **Fuente de hosts JSON**: obtención de inventarios de hosts desde un archivo JSON local o un endpoint HTTP(S) (estilo CMDB / Ansible / API personalizada); solo metadatos, se rechazan inventarios con secretos; cabeceras de autenticación HTTP admitidas
- **Compartición e importación de inventarios de hosts**: exportación de inventarios de solo metadatos para el traspaso entre equipos (incluido el formato Ansible YAML), importación desde el portapapeles
- **Plantillas de espacios de trabajo con nombre**: guarde vinculaciones de hosts, diseños divididos y comandos cwd/de inicio opcionales como plantillas, aplicables con un clic desde el conmutador rápido
- **Marcadores de registros de conexión**: marcadores de posición de reproducción + notas + salto por búsqueda; la lista de registros muestra el número de marcadores
- **Vista en vivo de canales de reenvío de puertos**: origen, destino y estadísticas de bytes de tráfico por conexión para reenvíos locales/remotos/dinámicos
- **Ampliación de acciones del disparador onOutput de scripts**: al coincidir un patrón de salida puede lanzar una notificación de escritorio, un sonido, un marcador de pestaña o iniciar la grabación de la sesión
- **Pegado seguro y difusión precisa**: retardo de pegado multilínea / espera del prompt / confirmación de comandos peligrosos; la difusión puede dirigirse con precisión a espacio de trabajo/selección/grupo/ventana
- **Mejoras del canal OpenSSH del sistema**: GSSAPI/Kerberos y algoritmos poscuánticos (PQ) admitidos a través del OpenSSH del sistema; cadenas de salto y proxies HTTP/SOCKS disponibles
- **KEX poscuántico híbrido de ssh2 integrado**: prefiere `mlkem768x25519-sha256` (ML-KEM-768 + X25519) con respaldo clásico; ya no requiere el ssh del sistema
- **Soporte de hosts RDP**: habilitar RDP en hosts del Vault y lanzar el cliente de escritorio remoto del sistema (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **El registro de cambios sigue el idioma de la interfaz**: notas de la versión en el idioma actual de la UI (10 idiomas)

### Windows ARM64
- **Los instaladores win-arm64 ya incluyen mosh / ET**: MoshMagies 0.1.9 y EternalTerminal 6.2.10 estrenan binarios nativos de Windows arm64
- **Canal de actualización automática dedicado para win-arm64**: los metadatos de actualización pasan al canal dedicado `latest-arm64.yml` en lugar de seguir las actualizaciones x64 (antes las actualizaciones arm64 instalaban el paquete x64 y funcionaban en emulación)

## [0.4.10] - 2026-07-17

### Funciones
- **Centro de diagnóstico de conexiones SSH**: «Probar conexión» en el panel de edición del host + «Ejecutar diagnóstico» al fallar la conexión, con comprobaciones paso a paso de DNS / TCP / host de salto / clave del host / autenticación / SFTP
- **El agente SSH como autenticación de primera clase**: los hosts pueden elegir explícitamente la autenticación por agente, ver las huellas de las claves del agente y designar una identidad preferida; el registro de conexión anota el método realmente usado
- **Instantánea de salud multi-host**: comprobación masiva con un clic desde el Vault de latencia, autenticación y carga/memoria/disco; filtre hosts anómalos y ejecute scripts
- **Fiabilidad SFTP fase 1**: transferencias reanudables, reintentos automáticos con retroceso, cola de transferencias persistente (sobrevive a reinicios), verificación SHA-256 opcional
- **Incorporación productizada**: guía de tres pasos para el primer Vault vacío; elementos de comando del conmutador rápido (ajustes/importación/chequeo de salud, etc.); avisos de migración en estado vacío; sugerencias tras la primera conexión exitosa; matriz de funciones del README

### Correcciones
- Los usuarios que actualizan un Vault existente ya no ven la guía de primer uso; los chequeos de salud cierran correctamente las conexiones de salto cuando falla la autenticación

## [0.4.9] - 2026-07-17

### Mejoras
- **Publicaciones y canal de actualización automática trasladados a un repositorio de publicación dedicado**: los instaladores y metadatos de actualización se publican ahora en el repositorio MgTerminal-releases; las descargas del sitio web y la actualización automática integrada no cambian, y los clientes antiguos siguen recibiendo actualizaciones mediante redirecciones desde las URL originales

## [0.4.8] - 2026-07-16

### Funciones
- **La conexión rápida admite EternalTerminal**: el asistente QuickConnect añade una entrada de protocolo ET (puerto SSH + puerto de servicio ET, 2022 por defecto); los binarios cliente de ET correspondientes vienen incluidos (macOS / Linux / Windows x64)
- **Autocomprobación de credenciales**: Ajustes → Sistema → Protección de credenciales añade «Autocomprobación»: una prueba de ida y vuelta de cifrado/descifrado más un escaneo del almacén que lista las entradas concretas que este dispositivo no puede descifrar (hosts / claves / identidades / grupos / proxies), facilitando localizar credenciales que deben reintroducirse tras un fallo del llavero
- **Primer instalador de Windows ARM64**: nueva compilación win-arm64 (mosh / et aún no incluidos; la actualización automática sigue temporalmente el canal x64)
- **Limpieza de restauraciones de sesión caducadas**: los diseños de restauración de más de 14 días se descartan al arrancar en lugar de restaurar montones de marcadores de posición obsoletos

### Correcciones
- **Interfaz rusa: completados 203 textos ausentes** (todo el espacio de nombres de scripts / automatización / grabación caía al inglés), más 3 del chino simplificado; una nueva prueba de paridad completa evita regresiones
- La conexión rápida de Mosh recogía una ruta personalizada de mosh-server sin aplicarla; ahora se escribe correctamente en la configuración del host

### Mejoras
- La selección total de SFTP (Cmd/Ctrl+A) y el renderizado de la lista comparten ahora una única regla de visibilidad, eliminando desvíos de comportamiento con archivos ocultos / términos de filtro
- Las notas de macOS del README coinciden con el proceso real de publicación (sin firmar, con pasos para permitirlo en Gatekeeper; las actualizaciones integradas no se ven afectadas)

## [0.4.7] - 2026-07-15

### Funciones
- **Idiomas de interfaz ampliados a 10**: cliente y sitio web alineados; se añaden 日本語 / 한국어 / Deutsch / Français / Español / Português (se conservan en / ru / zh-CN / zh-TW)
- Ajustes → Apariencia → Idioma ofrece todos los idiomas admitidos; los textos sin traducir siguen cayendo al inglés

## [0.4.6] - 2026-07-15

### Seguridad
- **Desactivar la verificación de claves de host SSH ya no es silencioso**: con `verifyHostKeys` desactivado (sesiones de terminal y conexiones de estadísticas de mosh) se registra una advertencia explícita de que se está aceptando cualquier clave de host sin preguntar
- **Advertencia persistente en la página de ajustes**: tras desactivar «Verificar claves de host SSH», bajo el interruptor permanece visible un aviso del riesgo de ataque de intermediario (en / zh-CN / zh-TW). Por defecto sigue activado

## [0.4.5] - 2026-07-15

### Correcciones
- **401 / flujos vacíos por texto cifrado anidado**: guardar repetidamente durante un fallo del llavero envolvía las claves en capas de cifrado (`enc:v2(enc:v1(...))`); corregido el límite del bucle de descifrado, los anidamientos múltiples dentro del presupuesto se descifran por completo: se acabó el «descifrado bien y luego descartado» y los falsos fallos de descifrado
- **Una credencial dañada ya no arrastra la carga de todo el almacén**: si falla el descifrado de un campo se conserva el valor almacenado tal cual (fail-soft), el almacén carga con normalidad y las claves siguen siendo recuperables tras reparar el llavero
- **Clave API de búsqueda web**: tras un fallo de descifrado, enfocar/desenfocar ya no borra por error una clave guardada; se añaden avisos explícitos de fallo de descifrado/cifrado en lugar de silencio
- **Corregida la identificación del cifrado DPAPI de Windows**: la protección contra doble cifrado pasaba por alto las claves DPAPI (cabecera `AQAAAN`), que un fallo del llavero recifraba en texto anidado; ya está corregido
- **Cursor Agent**: al fallar el descifrado ya no se inyecta texto cifrado como clave API en el proceso hijo
- Unificación de las tres zonas Provider / búsqueda web / Cursor de los ajustes: el fallo de descifrado pide claramente reintroducir la clave, y cambiar el idioma de la interfaz ya no sobrescribe una clave sin guardar

## [0.4.4] - 2026-07-14

### Correcciones
- **IA 401 / flujos vacíos**: cuando falla el descifrado de la clave API o la clave no se ha sincronizado con el proceso principal, las solicitudes ya no salen con el marcador `__IPC_SECURED__`; fallan de inmediato con un aviso para volver a guardar la clave
- El envío de mensajes espera a que los proveedores se sincronicen con el proceso principal, evitando fallos de autenticación por carreras
- Indicaciones de autenticación claras cuando la clave local es inutilizable (fallo de descifrado / ausente / marcador residual)

## [0.4.3] - 2026-07-14

### Correcciones
- **Descifrado de claves API**: el proceso principal descifra correctamente las claves `enc:v2` de la caja fuerte local; al fallar, el texto cifrado ya no se envía a los proveedores como texto plano (evitando los 401 y el sufijo `…5Q==`)
- **Reconocimiento de marcadores de credenciales**: los límites de conexión / guardas de sincronización en la nube reconocen también `enc:v2`, evitando enviar el cifrado de la caja fuerte local como contraseña o subirlo a la sincronización
- Mensajes de error accionables para flujos vacíos del modelo (`NoOutputGeneratedError`) y fallos de autenticación 401
- La detección de instalación del SDK de Cursor pasa a `require.resolve`, evitando falsos «no instalado»

## [0.4.2] - 2026-07-14

### Correcciones
- **Fallos de cifrado de claves API resueltos de una vez**: cuando el llavero (safeStorage) no está disponible se usa automáticamente una caja fuerte cifrada local (`enc:v2`); las actualizaciones de la aplicación ya no impiden guardar claves API tras la invalidación de las ACL del llavero
- macOS sigue intentando primero el llavero del sistema y recurre silenciosamente al alternativo si falla; Ajustes → Sistema muestra el backend activo

## [0.4.1] - 2026-07-14

### Mejoras
- Selector de temas: vistas previas en tarjetas (fondo + colores primario/secundario), alternancia de ámbito Core / Todos, búsqueda y estados vacíos
- Los temas predeterminados Snow / Midnight ganan contraste y profundidad de tarjetas, con las paletas de terminal `ui-snow` / `ui-midnight` sincronizadas
- Estados de selección y jerarquía visual unificados: hosts/árbol del Vault, lista/árbol/barra de pestañas de SFTP, navegación de ajustes, barra lateral de IA, barra superior del terminal
- Las listas de temas del terminal (diálogo / barra lateral) admiten búsqueda y vistas previas de muestras de color más claras
- Los colores codificados (estado de sincronización, toasts informativos, insignias de actualización, resaltados de arrastrar y soltar, etc.) se consolidan en tokens de tema

## [0.4.0] - 2026-07-13

### Funciones
- Descargas y actualizaciones aceleradas para usuarios en China: región detectada automáticamente con cambio a un espejo nacional y respaldo bidireccional con GitHub
- «Novedades» de los ajustes muestra ahora las notas de cada versión en un diálogo integrado en lugar de enlazar a GitHub
- Nueva entrada «Contactar con soporte» que copia el correo de contacto
- La reconexión automática SSH pasa a retroceso exponencial (desde 5 s hasta 60 s); tras 10 fallos consecutivos se detiene y pide reconectar manualmente
- El reenvío de puertos local/dinámico reutiliza la conexión SSH del terminal ya autenticada, evitando una segunda contraseña/2FA
- Al importar claves de seguridad FIDO2 (sk-*) se sugiere cambiar a la autenticación ssh-agent

### Cambios
- Eliminadas de los ajustes las dos entradas de GitHub «Informar de un problema» y «Comunidad»

## [0.3.0] - 2026-07-13

### Correcciones
- Los fallos de cifrado de la clave API al guardar un proveedor de IA ya no se tragan en silencio; aparece un error localizado claro bajo el campo de la clave API

## [0.2.9] - 2026-07-13

### Funciones
- macOS admite actualización automática: instala reemplazando el bundle tras la descarga, sorteando las restricciones de Squirrel para aplicaciones sin firmar (desde 0.2.9 todas las plataformas pueden actualizarse automáticamente)

### Correcciones
- El icono de la aplicación conserva la base redondeada del material oficial, coherente en claro y oscuro

## [0.2.8] - 2026-07-13

### Correcciones
- El paquete de Windows se cerraba silenciosamente al arrancar: afterPack vuelve a incrustar el hash de integridad tras reescribir el asar, con una verificación de CI para evitar recaídas
- El progreso y los errores de la instalación de actualizaciones son visibles en todas las plataformas

## [0.2.7] - 2026-07-13

### Correcciones
- Windows publica un instalador x64 seguro a nivel de arquitectura

## [0.2.6] - 2026-07-12

### Seguridad
- La ventana de bandeja empaquetada ignora `VITE_DEV_SERVER_URL` y bloquea la navegación / ventanas nuevas
- preload ya no añade el servidor de desarrollo a los orígenes de confianza bajo `app.asar`
- Actualizaciones forzadas a DOMPurify 3.3.2 y undici 6.23.0, corrigiendo un XSS alcanzable / DoS de cadena de descompresión
- afterPack repara el hash de integridad de los archivos ASAR y sincroniza Info.plist, evitando el cierre inesperado de macOS al arrancar

### Correcciones
- La prueba de integración del inicio de sesión automático de Telnet espera ahora al prompt de comandos antes de comprobar el evento de finalización

## [0.2.5] - 2026-07-12

### Correcciones
- Oculta la entrada «código fuente de GitHub» en la sección Comunidad de los ajustes
- Los enlaces de novedades / informes apuntan a `JasonZhangDad/MgTerminal`, corrigiendo los 404
- Corregido «Reiniciar ahora» sin respuesta: la salida para instalar la actualización ya no la cancela la comprobación asíncrona de cambios en before-quit
- «Reiniciar y actualizar» muestra un aviso claro al fallar; las plataformas sin instalación automática abren la página de Releases

## [0.2.4] - 2026-07-12

### Seguridad
- El guardado de credenciales se detiene cuando el cifrado no está disponible; se prohíbe recurrir al texto plano
- Los enlaces profundos SSH están desactivados por defecto, se rechazan las URL con contraseñas y la conexión exige confirmación
- El portapapeles OSC52 está desactivado por defecto
- CSP de Electron endurecida, integridad ASAR y fusibles de seguridad activados
- Eliminado el permiso disable-library-validation de macOS

## [0.2.3] - 2026-07-11

### Correcciones
- Corregido: el nombre de host `app://` empaquetado era pasado a minúsculas por Chromium, por lo que preload rechazaba inyectar el bridge de Electron y dejaban de funcionar el terminal, SFTP, ajustes, selección de archivos y reenvío de puertos
- Reconocimiento unificado de `app://magiesterminal` en la ventana principal, la de ajustes y las comprobaciones de permisos, restaurando los permisos de portapapeles y fuentes locales

## [0.2.2] - 2026-07-11

### Correcciones
- Detalles del host «Select Color Theme»: las ScrollArea anidadas hacían que los clics de tema no respondieran; se pasa a desplazamiento de una sola capa con selección por pointerdown
- Los diálogos de selección de archivo de clave SSH/clave local no estaban vinculados a la ventana padre, por lo que macOS no podía mostrarlos
- La ventana de Settings no se abría bajo el protocolo `app://`
- Los iconos de la barra lateral y del instalador pasan a los nuevos recursos de iconos

## [0.2.1] - 2026-07-11

### CI/CD
- Reactivadas las compilaciones automáticas de macOS y Windows (modo sin firma de código), ofreciendo paquetes listos para usar en más plataformas.

## [0.2.0] - 2026-07-11

### Funciones
- Corregido el envío de eventos IPC de actualización automática a una sola ventana; ahora se difunden a todas (la principal y la de ajustes los reciben)
- Unificadas las máquinas de estados de la comprobación manual y la actualización automática, eliminando tres estados paralelos
- La «Comprobación de actualizaciones» manual detecta versiones mediante la API de GitHub y, si hay actualización, dispara asíncronamente la descarga de electron-updater
- Tras pulsar «Comprobar actualizaciones» en la ventana de ajustes, el progreso de descarga se refleja en vivo en la interfaz
- La aplicación dispara automáticamente una comprobación de `electron-updater` 5 segundos tras el arranque, sin clic manual
- Al encontrar una versión nueva la descarga comienza automáticamente (`autoDownload=true`)
- Al completarse la descarga aparece un toast persistente; pulsar «Reiniciar ahora» instala
- Si la descarga falla aparece un toast de error con la alternativa «Abrir Releases»
- La barra de progreso de Settings > System muestra en vivo la descarga automática, dirigida por `useUpdateCheck`
- Las plataformas Linux deb/rpm/snap y otras no admitidas por electron-updater se omiten automáticamente, conservando el comportamiento de notificación por la API de GitHub

### Notas de diseño
- `broadcastToAllWindows` sustituye al envío único `getSenderWindow`, garantizando que todas las ventanas reciban los eventos IPC
- El campo `manualCheckStatus` sigue el estado de la comprobación manual en la interfaz (idle/checking/available/up-to-date/error) y se renderiza junto a `autoDownloadStatus` según prioridad
- `SettingsSystemTab` ya no mantiene estado local de actualización; recibe unidireccionalmente los datos unificados de `useUpdateCheck`
- Los dos sistemas antes independientes (notificaciones por API de GitHub + descarga manual de electron-updater) se fusionan en una máquina de estados: `useUpdateCheck` es la única fuente de verdad que impulsa el toast de `App.tsx` y la barra de progreso de `SettingsSystemTab`
- Los escuchadores IPC persistentes globales se registran una sola vez en `autoUpdateBridge.init()`, evitando registrar/limpiar escuchadores en cada solicitud de descarga manual
- `autoInstallOnAppQuit=false`: sin instalación silenciosa, el reinicio lo dispara el usuario

### Cambios de interfaz（SettingsSystemTabProps）
- Eliminados: `autoDownloadStatus`, `downloadPercent`
- Añadidos: `updateState` (UpdateState completo), `checkNow`, `installUpdate`, `openReleasePage`

### Notas
- Semántica de `checkNow`: usa la API de GitHub (`performCheck`) para detectar versiones nuevas; si hay actualización y electron-updater no ha empezado la descarga, dispara asíncronamente `bridge.checkForUpdate()` para iniciar el flujo de descarga automática
- Esta función solo aplica a aplicaciones empaquetadas (Windows NSIS, macOS dmg/zip, Linux AppImage); el modo dev requiere `forceDevUpdateConfig=true` + `dev-app-update.yml` para pruebas (ver `.gitignore`)
- El antiguo toast `hasUpdate` se suprime mientras `autoDownloadStatus !== 'idle'`, evitando duplicados con el nuevo toast

### Mejoras de CI / compilación
- Se omiten las compilaciones de macOS / Windows (requieren certificados de firma de código de pago) para centrarse en paquetes Linux gratuitos
- Actualización del compilador Linux x64 (AlmaLinux 8): Clang preferente, con gcc-toolset-13 como alternativa
- Actualización del compilador Linux arm64 (Debian Bullseye): de `build-essential` a `clang-14 + lld-14`
- El trabajo de release ya no depende de las compilaciones de macOS/Windows; los push de etiquetas publican la release directamente desde los artefactos de Linux
- Validación suavizada de artefactos deb: los archivos no encontrados emiten una advertencia en lugar de un error, evitando que los saltos de plataforma hagan fallar la CI
