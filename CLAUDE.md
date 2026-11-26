# RideCrew (repositorio Ciclismo-amigos): web de rodillos

Web para rodar y entrenar en rodillo con amigos. Conecta rodillos y sensores por Web Bluetooth
desde el navegador, con recorrido 3D, entrenamientos ERG y salida en grupo en tiempo real.
Todo en español: código, comentarios, interfaz y mensajes de commit.

- **Producción:** https://atletacuerdo.github.io/Ciclismo-amigos/ (cada push a `main` despliega
  en GitHub Pages; allí `BASE_PATH=/Ciclismo-amigos/`).
- **Navegadores:** Chrome en PC, Mac y Android, y Bluefy en iPad e iPhone (Safari no tiene Web Bluetooth).

## Stack y comandos

Vite 5, React 18, TypeScript 5.6, three.js 0.180 y Firebase 12 (Realtime Database).

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor local en `http://localhost:5173` (o `iniciar-web.bat`) |
| `npm run dev:https` | HTTPS autofirmado para probar desde el iPad en la red local |
| `npm run build` | `tsc --noEmit` y build a `dist/` |
| `npm run typecheck` | Solo comprueba los tipos |

Web Bluetooth solo funciona en un contexto seguro (`https://` o `localhost`), y `requestDevice`
tiene que llamarse dentro del propio clic.

## Estructura

- `src/ble/`: conexión BLE (`SensorBle.ts`), perfiles de dispositivo y parsers (FTMS, potencia, FC, CSC).
- `src/recorrido/`: escena 3D (`escena.ts`), ciclista (`ciclista3d.ts` monta bici + humano), bici con
  geometría real de talla 56 (`bici.ts`: cuadro, horquilla, cockpit, transmisión y cadena animada),
  mallas por campos de distancia (`sdf.ts`), caché de esas mallas en IndexedDB (`cacheMallas.ts`,
  **subir VERSION si cambia su generación**), humano con IK de piernas, brazos, agarre de dedos y
  tronco ajustado al manillar (`ciclistaHumano.ts`), casco y gafas (`equipamiento.ts`), zapatillas
  (`zapatilla.ts`), avatar, física, perfil de 17 km y terreno.
- `src/entrenamientos/`: 151 entrenamientos: base (`catalogo.ts`) + biblioteca ampliada (`biblioteca.ts`,
  propia, basada en protocolos clásicos; potencias en % del FTP), importador de archivos .zwo/.mrc/.erg
  (`importar.ts`, categoría automática por intensidad),
  entrenamientos propios (`propios.ts`, se guardan en el navegador) y tipos.
- `src/entrenamiento/`: grabación de la sesión, resumen, exportación TCX y almacén del historial.
  Logros (`logros.ts`, 97 por categorías; subir `VERSION_LOGROS` al añadir más para no celebrar
  de golpe los que ya se tenían) y niveles 1-100 (`niveles.ts`: XP del historial; `nivelPublico.ts`
  guarda mi nivel y lo publica en `salas/{sala}/ciclistas/{uid}/nivel`, que necesita las reglas nuevas).
- `src/multijugador/`: Firebase y el hook `useSalida` para la salida en grupo.
- `src/cuenta/`: cuentas (Firebase Auth: Google y correo/contraseña; **sin cuenta no se puede usar la web**:
  `App` solo enseña `PantallaCuenta` y `usuarioActual()` ya no entra de forma anónima) y sincronización «primero en local» en `usuarios/{uid}/…` (perfil, propios, historial,
  muestras en texto y `borrados` para que lo borrado no vuelva). El historial local avisa a la nube
  con `establecerEspejo` (almacen.ts). Pantalla: `components/PantallaCuenta.tsx`.
- `src/strava/strava.ts` + `src/components/Strava.tsx`: subida automática a Strava (OAuth; cada
  ciclista guarda su refresh token en el navegador). Oculto mientras no existan
  `VITE_STRAVA_CLIENT_ID` y `VITE_STRAVA_INTERMEDIARIO` (irán en `.env.production`; no son secretos).
- `servidor-strava/`: intermediario para Cloudflare Workers (`worker.js`, guarda el Client Secret)
  y `GUIA.md` con los pasos que hace el usuario (aplicación en Strava + Worker).
- `src/components/`: pantallas y paneles de React.
- `firebase/database.rules.json`: reglas de la Realtime Database. Si cambian, el usuario tiene
  que pegarlas a mano en la consola de Firebase.
- `public/modelos` y `public/texturas`: recursos CC0 (Quaternius, Poly Haven); créditos en
  `public/CREDITOS.md` y en Ajustes (`src/components/Creditos.tsx`; si se usa algo CC-BY, citarlo ahí).
- `public/modelos/realistas/`: modelos escaneados de Poly Haven (rocas, tocones, tronco, ramas,
  helecho, plantas con flor) simplificados con gltf-transform (`simplify`, `resize 512`, `webp`).
  Los originales están fuera del repo en `CLAUDE/recursos-3d/polyhaven/modelos/`. Los árboles de
  Poly Haven pesan 40-950 MB (calidad cine): no sirven en tiempo real.
- Texturas del suelo en KTX2 (comprimidas para la GPU, clave para que el iPad no se quede sin
  memoria) junto a los JPG de respaldo. Si se cambia un JPG, regenerar con
  `herramientas/comprimir-texturas.mjs`. El transcodificador está en `public/basis/`.
- En iPhone/iPad (`esDispositivoIos()`): sin MSAA, resolución ≤ 1,25, sombras 1024, cielo 2k.
  Si se pierde el contexto WebGL, `VistaRecorrido` recrea la escena en calidad media.
- `pruebas/`: páginas de prueba locales (en `.gitignore`), p. ej.
  `pruebas/ciclista.html?vista=lado|manos|pies|cockpit|bici|transmision|cabeza…&modelo=…&casco=…`.

## Estado actual (2026-09-27)

24-11: **Weekend Warriors** (app del club, repo `AtletaCuerdo/weekend-warriors`): su botón «Hacer en RideCrew»
abre `https://ridecrew.tricoach.es/#ww=<base64url de JSON { v: 1, e: [{ id, n, d, f, b }] }>`.
`entrenamientos/weekendWarriors.ts` (`LLEGARON_DE_WW`, al cargar el módulo) los valida con `validar` de
`compartidos.ts` (ahora exportada), les pone categoría con `categoriaSegunIntensidad` y los guarda como propios
`ww-…` (si llega el mismo id, se sustituye); se sincronizan con la cuenta como cualquier propio. La web abre
en Entrenamientos con un aviso. **Sin reglas nuevas.** Si cambia el formato, cambiar también `src/ridecrew.ts` de WW.

Nombre visible: **RideCrew** (título «RideCrew by TriCoach», cabecera, icono «RC», rotulación del maillot,
TCX y Strava). La dirección, el repositorio, Firebase y las claves de localStorage siguen con
«ciclismo-amigos». Cyclink se descartó: es marca de Shimano en la UE.


27-09: paso 3 del plan. Perfil de la vuelta pequeño en la esquina inferior derecha (al tocarlo
se amplía; clave `rodillos.perfilVuelta`) y, con el móvil en horizontal (`max-height: 520px`),
el marcador en una sola fila sin las medias ni el detalle de la vuelta.

Antes (26-09): iPad (KTX2, límites iOS, recuperación del contexto WebGL), pantalla siempre
encendida (NoSleep) y aerodinámica según bici, casco y ruedas. Commit `9d2cb19`:
- Marcador del recorrido en la barra superior, en dos filas; el centro queda libre.
- Bici nueva: geometría real (la rueda ya no toca el cuadro), cuadro y cockpit de una pieza
  con uniones suaves, logotipo en el diagonal, manetas, cadena de eslabones, discos perforados.
- Postura: tronco inclinado para llegar al manillar, manos agarrando las manetas; en la cabra,
  codos en los reposabrazos y puños en las puntas del acople.
- Casco rígido de verdad (grosor, rejillas con paredes de espuma, banda fina) y zapatillas.
- Generar las mallas cuesta unos 2-3 s la primera vez; luego se leen de IndexedDB.

27-09: paso 4 del plan. Rocas con musgo, tocones, tronco caído, ramas, helechos y plantas con
flor escaneados (Poly Haven, CC0) junto a la carretera, en lugar de las rocas estilizadas; pantalla
de Créditos en Ajustes. Solo se dibujan cerca (45-190 m) y sin mapas de oclusión/rugosidad para
ahorrar memoria en el iPad.

27-09 (tarde): subida automática a Strava programada y probada con un Strava simulado
(conectar, subir, esperar el procesado, poner «Virtual Ride», desconectar). Falta que el usuario
cree la aplicación de Strava y el Worker (ver `servidor-strava/GUIA.md`) y me pase el Client ID y
la dirección del Worker. Strava limita las apps nuevas a 1 atleta: hay que pedir más capacidad.

27-09 (noche): rodar con amigos (el objetivo principal de la web). Inicio: «Amigos rodando ahora»
(, solo lectura) y «Rodar a su lado». El punto del circuito es  + km grabados
(la grabación, el TCX y Strava siguen con lo pedaleado). Entrar al recorrido une a la salida en grupo.
Rebufo ( en fisica.ts): hasta −30 % de aire a menos de 3 m de otro y nada a 12 m; también
baja el Cw que se envía al rodillo; indicador junto a los vatios y tiempo a rueda. Chat del grupo
(, ) con mensajes rápidos; **necesita las reglas nuevas pegadas**.

27-09 (noche): rodar con amigos, el objetivo principal de la web. Inicio: «Amigos rodando ahora»
(`useConectados`, solo lectura) y «Rodar a su lado». El punto del circuito es `adelanto` + km grabados
(la grabación, el TCX y Strava siguen con lo pedaleado). Entrar al recorrido une a la salida en grupo.
Rebufo (`ahorroRebufo` en `fisica.ts`): hasta −30 % de aire a menos de 3 m de otro y nada a 12 m; también
baja el Cw que se envía al rodillo; indicador junto a los vatios y tiempo a rueda. Chat del grupo
(`salas/{sala}/chat`, `ChatGrupo.tsx`) con mensajes rápidos; necesita las reglas nuevas pegadas.

23-10: acompañantes a tu ritmo (`crearAcompanantes` en `bots.ts`: 3 ciclistas que van contigo a tus
vatios, «solo compañía» sin nadie delante o «con rebufo» con uno a 2,7 m), cambiar de circuito al
momento si aún no se ha grabado nada, cámara Detrás / Lado / Arriba (`vistaCamara`, clave
`rodillos.vistaCamara`), barra superior fija (el logo siempre a mano) y cada pantalla se abre desde
arriba. Rodillos sin cadencia (Van Rysel D100): el 0 que mandan con vatios no cuenta, el ciclista pedalea
a 85 rpm si no hay cadencia, y en Ajustes «Vatios y cadencia» se elige la fuente (`rodillos.fuentes`).
TrainingPeaks: pendiente de saber si dan acceso a su API.

25-10: tema oscuro de TriCoach (igual que TrCoach y TriCoach Entrenos, repo `TriCoach-Entrenos`): fondo
pizarra `#0b1220`, paneles `#111c30`, acento cian `#22d3ee` → azul `#3b82f6` (`--degradado`, con texto
oscuro `--texto-sobre-acento`) y verde `#4ade80`. Título «RideCrew by TriCoach» (el nombre sigue siendo
RideCrew), logotipo «Ride» cian + «Crew» blanco + «by TriCoach» verde, e icono RC nuevo en cian sobre pizarra.

25-10: panel del administrador (`components/PantallaAdmin.tsx`, `cuenta/admin.ts`, botón 🛡️ en la
cabecera): cada cuenta publica `fichas/{uid}` (nombre, correo, sesiones, metros, strava, alta, t) y solo
el administrador las lee todas (su uid va escrito en la regla `.read` de `fichas`; también vale
`admins/{uid}: true` puesto a mano en la consola). Plazas de la
app de Strava en `PLAZAS_STRAVA` (10). **Necesita las reglas nuevas pegadas.** El uid sale en «Tu cuenta».

25-10: la web exige cuenta. Sin sesión solo se ve la pantalla para entrar o crear cuenta, y las reglas
piden `auth.provider !== 'anonymous'` en todo. **Necesita las reglas nuevas pegadas.**

25-10: bots en tres tipos. 1) Las 3 grupetas a % del FTP vienen puestas al empezar (clave nueva
`rodillos.grupetas2`, se quitan con la casilla del circuito o con ✕ en el menú). 2) Acompañantes con o sin
rebufo. 3) Triatlón (`crearGrupoTriatlon`): 3 bots con el último a 15 m por delante, a los vatios que elige
el ciclista (se pueden cambiar sin moverlos), con tu CdA y tu peso y sin rebufo entre ellos; el último
lleva un cartel trasero (`ponerCartelTrasero`) con la distancia de rueda a rueda: verde fuera y rojo dentro
de los 12 m de rebufo, gris si van detrás. En desarrollo, `?sincuenta` salta la pantalla de cuenta.

25-10: rodar con amigos de dos formas desde «Amigos rodando ahora»: «A su lado» (cada uno a su ritmo,
como antes) y «Siempre juntos» (`juntosCon` en App): el nodo de la sala lleva `juntos` (uid del amigo,
que da nombre al grupo y entra solo) y `exige` (IF del entreno × intensidad; 0 en libre). Marca el ritmo
el más exigente; los demás van pegados (`pegadoRef`: su punto y su velocidad en pantalla, sin tramos
cronometrados; lo grabado sigue siendo lo pedaleado). Botón «Soltarme». Chat con mensajes de voz
(MediaRecorder, MP4/AAC o WebM, 24 kbit/s, máx. 20 s, en base64 dentro del mensaje: `audio`, `dur`).
**Necesita las reglas nuevas pegadas.**

26-10: 8 entrenos nuevos (VO2Max 30/30 de 4 y 5 bloques; 6 de tempo alto al 84-90 %). Calorías
(`entrenamiento/calorias.ts`, `resumen.kcal`): por pulso con la fórmula de Keytel 2005 si hay pulsómetro en
≥ 70 % de la sesión y el perfil tiene edad y sexo (Ajustes), y si no, kJ / 22 % de eficiencia; las sesiones
de antes siguen con kJ. Strava en el panel: solo cambia la ficha el aparato donde se conectó o
desconectó (`estadoStravaAqui`).

26-10: cruces entre circuitos (`CRUCES` en `circuitos.ts`, dos por vuelta en llano): a 600 m sale el
aviso «🔀 Cruce» con ⬅️/⬆️/➡️ y, al pasarlo, `pasarACircuito` carga el otro (igual que el cambio en meta);
en el 3D, cartel azul 80 m antes y ramales de asfalto. Pegado a otro no se gira. Rendimiento: cada ciclista
pesaba ~515 000 triángulos (zapatillas 65 000 cada una) y el público llevaba las mismas zapatillas.
`enDetalleBajo(fn, factor)` (sdf.ts) genera versiones con vóxeles más gruesos (claves `|lejosN` en la caché);
`Ciclista3D.ponerDetalle` las usa a más de 22 m, a más de 350 m el ciclista no se dibuja, y el público usa
siempre las ligeras. Con 3 grupetas: de 5,7 M a ~1,8 M triángulos por imagen. Cuadro y manillar con factor
1,7-1,8 (con 3 los tubos desaparecen). Las fichas guardan `stravaAtleta` (nombre en Strava).

27-10: el modo demostración solo lo ve el administrador (y en desarrollo). Aviso de altas por correo:
al entrar con una cuenta creada hace < 30 min, la web llama a `/alta` del Worker de Strava con el ID token
(`avisarAltaSiNueva` en `cuenta/admin.ts`); el Worker lo valida con `accounts:lookup` de Google y manda el
correo con el enlace `CORREO` (Email Routing de tricoach.es), `AVISO_DESTINO` y `AVISO_REMITENTE`. Pasos
del usuario en `servidor-strava/GUIA.md`, parte 3.

27-10: `servidor-strava/wrangler.jsonc` para desplegar el Worker con Workers Builds desde GitHub (raíz
`servidor-strava`, `npx wrangler deploy`, `keep_vars`; el secreto de Strava y `AVISO_DESTINO` se ponen a mano
en el panel porque el repositorio es público). Pendiente: que el usuario lo conecte desde el PC (GUIA.md,
parte 4); el Email Routing de tricoach.es y su correo de destino ya están hechos.

31-10: RideCoins (`entrenamiento/ridecoins.ts`): se ganan por minuto según % del FTP (1 / 1,5 / 2), +25 % con
amigos, +20 por entreno completado, +10 primera del día y +25 de racha de 3 días; van en `resumen.monedas` (las sesiones
de antes cuentan 1/min). Tienda (`PantallaTienda.tsx`) con 5 nutriciones (guayaba, geles 30/50 con y sin cafeína) que
suben la velocidad virtual unos minutos (también la distancia grabada y Strava; no se suman; pegado no sirve). Lo
comprado y gastado va en `perfil.despensa` (contadores que solo suben; al sincronizar gana el mayor): **sin reglas
nuevas**. Al terminar: «Finalizar» o «Finalizar y ver estadísticas» sobre una escena SVG animada (`EscenaFinal.tsx`:
cervezas, cama con Strava o fisio). Tienda de material: hecha el 04-11.

01-11: escenas finales rehechas en estilo cinematográfico (siluetas a contraluz, luz cálida, movimientos lentos;
sigue siendo SVG, sin GPU). Gesto de comer: `Ciclista3D.comer()` (3 s; `escena.miComer()`), la mano derecha va a
la boca con un gel naranja (`JineteHumano.posar(…, comer)`). Ojo: `dirMundo` devuelve direcciones de 1 m.

03-11: Elite Bluetooth antiguos (Real Turbo Muin B+; nombre «TM»): anuncian solo CSC 0x1816 y su servicio propio
`347b0001-…`, pero tienen Cycling Power 0x1818. `Potenciometro.opcionesBusqueda` busca también por ese servicio y saca la
cadencia del CSC del mismo aparato. La resistencia no se controla (protocolo propio de Elite): rodar en «vatios libres».

03-11 (2): rodillo por ANT+ FE-C con adaptador USB (`src/ant/rodilloAnt.ts`, WebUSB, vendedor Dynastream 0x0fcf):
vatios/cadencia/velocidad (páginas 16 y 25), ERG (49), pendiente (51), rebufo (50) y peso (55). Sus datos entran como
fuente `ftms`; en el bucle del rodillo manda el ANT+ si está conectado. Solo Chrome en ordenador/Android (no iOS);
en Windows hace falta WinUSB con Zadig. Sin probar con el aparato. En cada tarjeta Bluetooth, «¿No sale tu aparato?
Ver todos» abre la lista con `acceptAllDevices`.

04-11: «⏭ Saltar calentamiento» en la cabecera del entreno guiado (`finCalentamiento` en `entrenamientos/tipos.ts`:
rampas de subida que empiezan ≤ 65 % y bloques ≤ 60 % y ≤ 10′ del principio, hasta 25′; 150 de 151 entrenos lo tienen):
mueve `inicioS` y adelanta las vueltas y bloques que faltan. Giro en los cruces: a 40 m del cruce elegido, `giroCruce`
(App) → `escena.girarEnCruce`: curva de 9 m de radio hacia el ramal con la cámara detrás, fundido a negro
(`.fundido-cruce`) y el cambio de circuito a `CRUCE_CAMBIO_M` (20 m) pasado el cruce; el circuito nuevo aparece desde negro.

04-11 (2): piel negra en iPad: el cargador de glTF de three usa ImageBitmap si el navegador no dice ser Safari (Bluefy)
y WebKit la decodifica en negro; `cargadorGltf()` (recursos.ts) fuerza TextureLoader en iOS. Cruce: al elegir, el aviso
grande se quita (`cruceDecidido`); si se gira queda `.aviso-cruce-mini` con la cuenta atrás y ✕. Escena final: plegada
por defecto con `.resumen-mini` (tiempo, km, W, RideCoins); el panel completo sigue montado (sube a Strava) y se despliega.

04-11 (3): pausa automática (App, clave `rodillos.autoPausa`, casilla en Ajustes): < 15 W y < 10 rpm 5 s seguidos
(en bajada, solo si la bici casi se para) pausa; si la pausó ella, sigue sola con > 40 W. «Tu evolución» en el historial
(`EvolucionVatios.tsx`): mejores 5′/20′/60′ y FTP por mes (12 meses); las sesiones guardan `resumen.mejores` y
`resumen.ftp`, las de antes se calculan desde sus muestras y se guardan en `rodillos.mejoresCache`; al terminar, si el
95 % del mejor 20′ supera el FTP, se propone subirlo. Asistente de primera vez (`AsistenteInicio.tsx`, sin sesiones;
`rodillos.asistenteVisto`). Material en la tienda (`MATERIAL` en ridecoins.ts, `despensa.material`; gratis: bici de ruta,
ruedas de perfil bajo y casco de ruta; lo que ya se llevaba se regala con `regalarMaterial`); en el editor sale 🔒 con el
precio y se compra y pone en un solo cambio.
Bicis en las subidas (`SUBIDA_BICI` en fisica.ts, sobre los vatios desde el 2 % y entero desde el 5 %): ruta +0,5 %,
escaladora +1 %, aero −1 %, cabra −3 %. A 250 W y 75 kg: llano 38,6 / 38,5 / 39,3 / 41,0 km/h; al 7 %: 14,4 / 14,6 /
14,2 / 13,9 km/h (ruta / escaladora / aero / cabra).

05-11: «⏭ Saltar bloque» en los mandos del entreno (`saltarBloque` → `saltarHasta(fin)` en App, el mismo que usa
«Saltar calentamiento»: mueve `inicioS`, recorta el bloque a medias y adelanta vueltas y bloques). Pulso por zonas
(`colorPulso` en avatar.ts, % de `fcMaxima`: azul <60, verde <70, amarillo <80, naranja <90, rojo <97, morado);
FC máxima en Ajustes (`perfil.fcMax`, se valida en `edadSexo`; sin ella, Tanaka con la edad o 190). Sobre la gráfica del
entreno, vatios reales (media de 5 s) y pulso (40-100 % de la FC máx.) de `trazaRef` (App); al tocarla se amplía.

05-11 (2): pestaña «❤️ Análisis de frecuencia cardiaca» en el resumen (`entrenamiento/analisisFc.ts` +
`components/AnalisisFrecuencia.tsx`; solo con pulso en ≥ 70 % y ≥ 10 min). Series: los bloques principales
(`resumen.bloques`) con el mismo objetivo (±4 %) y duración (±15 %); el grupo más numeroso (≥ 3); por serie, pulso medio
de la segunda mitad; regresión lineal frente al nº de serie con prueba t de la pendiente (p < 0,05); recuperación
= lo que baja el pulso entre 50 y 65 s después de un bloque seguido de descanso; desacople Pa:Hr primera/segunda
mitad. Sin series: desacople aeróbico de toda la sesión (≥ 20 min). Veredicto (muy bien / bien / atención / fatiga) y
recomendaciones; `resumen.fc` (clave «W×s» y vatios por pulsación) para comparar con la próxima vez que se haga lo
mismo. Probado con la sesión del 04-11 (20 series de 2′ a 216 W: deriva +0,3 ppm, no significativa, desacople 0,3 %).
La gráfica de pulso de Strava va por km (en las subidas virtuales se va lento y se aprietan los minutos); la del
Garmin, por tiempo: los datos son los mismos.

05-11 (3): editor de entrenamientos: «Potencia en: Vatios / % del FTP» (`rodillos.editorUnidad`; en vatios se escribe con
el FTP de ahora y se guarda en % con un decimal) y duraciones en minutos + segundos (`Duracion`, mínimo 5 s).

09-11: recorrido en el móvil (≤ 760 px de ancho o tumbado con ≤ 520 px de alto): a la vista solo Empezar/Pausa, «☰ Más»,
Nutrición y Terminar; el resto (bots, fantasma, cámara, circuito, sensores, entreno, salir) en `.hud-botones-extra`, que se
abre con «☰»; tumbado, solo iconos (`.etiqueta-boton`). Selector de entrenos: `max-height: 100dvh`, `.selector-lista` con
`min-height: 0` y `touch-action: pan-y` (el recorrido tiene `touch-action: none` y la lista crecía sin límite).

12-11: ERG por ANT+ que a veces no cambiaba (amigo del Elite antiguo, entreno «CX W10»: se quedaba en 420 o 295 W).
`RodilloAnt` mandaba cada orden (mensaje confirmado 0x4F) sin mirar si llegaba y la de viento y la de pendiente seguidas.
Ahora van en cola de una en una, se espera el evento del canal (0x40: 0x05 llegó, 0x06 falló → se repite, 0x1F canal
ocupado), 1 s sin respuesta → reintento (máx. 3), y la orden en vigor (ERG o pendiente + viento) se repite cada 2 s.

13-11: protección del ERG (App, bucle del rodillo; amigo nuevo con picos y el rodillo bloqueado): pausado, sin empezar o
con < 45 rpm (sin cadencia: < 40 % de los vatios) 2,5 s seguidos, se manda el 40 % del objetivo (mín. 60 W); con ≥ 60 rpm
1,5 s vuelve al objetivo en una rampa de 8 s. Grupeta de 230 W que no se iba: no era un fallo, la cabra (CdA ×0,83) con el
rebufo pleno dentro del grupo (−30 %) a 155 W va a 38,9 km/h y la grupeta (CdA 0,29 × 0,88) a 230 W, a 39,0 km/h.

13-11 (2): «Compartidos»: los entrenos de otros solo salen en esa carpeta (y en la pestaña «👥 Compartidos» del selector
del recorrido), con la etiqueta de la categoría que les puso el autor (`EtiquetaCategoria`) y filtro por etiqueta; en las
carpetas de categorías solo el catálogo y los míos. 🗑️ en la tarjeta y en la ficha: el autor quita los suyos (le siguen
quedando en sus entrenos) y el administrador borra cualquiera (`borrar(clave)` en compartidos.ts; regla `.write` de
`compartidos` con el uid del administrador o `admins/{uid}`). Reglas pegadas por el usuario el 15-11: funciona.
Amigo del Elite Suito-T con pedales Favero: pendiente de saber el modelo (los bePRO solo tienen ANT+; los Assioma, una
sola conexión Bluetooth a la vez).

13-11 (3): borrar mis entrenos desde las carpetas (🗑️ en la tarjeta y en la ficha; `onBorrarPropio` → `guardarPropiosCompartidos`,
que también los quita de Compartidos). Bluetooth: «Error de Bluetooth (2)» en el rodillo y el pulsómetro a la vez (amigo del
Suito-T): al abrir la web se reconectaban todos a la vez (`reconectarRecordado`). Ahora las conexiones van por turnos
(`enTurno` en SensorBle.ts), la primera se reintenta hasta 3 veces (1,5 s y 3 s) y el mensaje dice que cierre otras apps.

14-11: no llegó el correo de alta de «José aita de aitor» (sí llegaban otros; no estaba en no deseado). La web lo
intentaba una sola vez y con el reloj del aparato (< 30 min). Ahora `avisarAltaSiNueva` reintenta a los 20 s y 2 min y
usa 24 h en el aparato (el Worker sigue mirando 30 min con la hora de Google). Además, en el panel 🛡️: «🆕 N cuentas
nuevas desde tu última visita» e insignia en cada fila (`adminVistoEn`/`marcarAdminVisto`, clave `rodillos.adminVisto`;
la primera vez, las de 3 días) y un globo rojo con el número en el botón 🛡️ de la cabecera.

17-11: el análisis de pulso comparaba los descansos de 4′ en «Tempo alto progresivo 3×12′»: sus series son rampas
(84→90 %) y `apuntarCortes` (App) solo tomaba bloques constantes, así que el «más duro» eran las recuperaciones. Ahora
las rampas cuentan por su media (fuera la primera, la última y las que empiezan o acaban < 85 % del máximo). Cambia en
9 de 151 entrenos (todos a mejor). Las sesiones ya guardadas se quedan con sus bloques.

17-11 (2): amigo del Suito-T: ya conecta a la primera y no se desconecta. En una serie larga los vatios oscilaban
(objetivo 175-200, veía 130-190-145). Por si era la protección del ERG con una lectura suelta de cadencia baja, ahora
solo salta con < 45 rpm **y** < 70 % del objetivo (o pausado). Pendiente: si vuelve a pasar, captura del Registro
(¿sale «ERG: cadencia muy baja…»?); si no sale, es el ERG del propio rodillo.

18-11: Eric (Elite ANT+, Chrome en Mac) a menudo abre la web «como nuevo»: el navegador pierde lo guardado (localStorage +
IndexedDB; sospecha: Chrome con «borrar datos de sitios al cerrar» o desalojo por espacio). La nube lo recuperaba, pero:
1) el asistente de primera vez salía antes de terminar la sincronización y, al poner FTP y peso, el perfil «nuevo»
(perfilT = ahora) pisaba el de la nube; 2) `iniciarLogrosVistos([])` con el historial aún vacío hacía que al acabar se
celebrasen todos los logros («Primera pedalada»). Ahora: el asistente espera a que acabe la sincronización (mientras,
«☁️ Recuperando tus datos de la nube…»), `logrosNuevos(lista, idEsta)` solo celebra lo que consigue esta sesión, y se pide
`navigator.storage.persist()`. Pendiente: que Eric mire el ajuste de Chrome.

19-11: logros de madrugada (idea de un deportista que sube al rodillo a las 4:00): «Tempranero» (< 7:00, era «Madrugador»,
mismo id), «Antes que el gallo» (< 6:00), «Trasnochado» (< 5:00) y «El más madrugador» (15 sesiones antes de las 7:00, con
progreso) e «Insomnio de campeón» (15 antes de las 5:00). Cuentan las sesiones empezadas desde las 3:00 (`antesDe`).
`VERSION_LOGROS` = 4.

21-11: «🗓️ Tu semana con TriCoach» (`entrenamientos/tricoach.ts`): las sesiones de bici que el entrenador marca
«🏠 Rodillo» en TriCoach Entrenos salen en una carpeta de Entrenamientos y en la pestaña del selector del recorrido.
Conectar una vez: `conectar()` abre `entrenos.tricoach.es/?vincular=ridecrew&vuelta=…`, el deportista pulsa «Permitir»
y vuelve con `#tricoach=<token>` (`VINO_DE_TRICOACH`, token en `rodillos.tricoach`, solo en este navegador). Se piden
con `GET entrenos.tricoach.es/api/ridecrew/semana` (Bearer): bloques en orden con vatios exactos → `aBloques` los pasa a %
del FTP de RideCrew (vatios exactos) y agrupa «A B A B…» en intervalos; categoría con `categoriaSegunIntensidad`. Caché
de la semana en `rodillos.tricoachSemana` (se tira el lunes, hora de España). «👥 Pasar a Compartidos» las comparte con
`origen: 'tricoach'` (etiqueta «Entreno de TriCoach» y filtro en Compartidos). **Sin reglas nuevas.**
En el iPhone (RideCrew en Bluefy, Entrenos en Safari) la redirección no sirve: **código de 6 letras** que da Entrenos
(«Conectar RideCrew») y se escribe en la carpeta (`conectarConCodigo` → `POST /api/ridecrew/canjear`).
Las llamadas van como POST de texto (sin preflight) y prueban dos direcciones del mismo Worker: entrenos.tricoach.es y,
si no llega (Bluefy en el iPhone de Jesús: «No se puede contactar»; Safari sí llegaba), `tricoach-entrenos.jfer-luna.workers.dev`.
Arriba de Compartidos, escaparate fijo «Entrenos de TriCoach» (`.escaparate-tricoach`): filtra los suyos y enlaza a tricoach.es.
21-11 (2): logro «🏅 Entrenado por TriCoach» (5 entrenos de TriCoach completados: `resumen.tricoach`, contado en
`logrosSesionRef.tricoach` al completar uno con `origen: 'tricoach'`; `VERSION_LOGROS` = 5) y sello en la escena final
(`SelloTricoach` en ResumenEntreno: logo «TriCoach» y «¡Sesión de TriCoach completada!», enlace a tricoach.es).

21-11 (2): estrellas invitadas en el menú 🤖 Bots («⭐ Estrellas invitadas», un toque pone y otro quita): Pogačar (maillot de
campeón del mundo: `avatar.arcoiris` → uniforme `uArcoiris` del sombreador del maillot, rayas en pecho, espalda y puños;
casco amarillo, bici blanca) y Sanders (equipación verde, cabra, lenticular, casco aero). `ESTRELLAS`/`crearEstrella`/
`recolocarEstrellas` en bots.ts: 400 W (47 y 50 km/h en llano), salen 150 m detrás y cada 10′ rodando vuelven a salir
detrás para adelantarte. El dorsal lleva su nombre. Sin logotipos de patrocinadores.

22-11: 🎙️ voz con los amigos (micro abierto, `multijugador/voz.ts` + `components/PanelVoz.tsx`, abajo junto a los emojis;
solo dentro de la salida). WebRTC en malla (llama el de uid menor), STUN de Google, sin TURN todavía. Encuentro por
Firebase: `salas/{sala}/voz/{uid}` (presencia con onDisconnect, `mudo`) y `salas/{sala}/vozSenales/{para}/{id}` (oferta,
respuesta, ice; quien recibe lo lee y lo borra). Micro con cancelación de eco y ruido; 🎙️/🔇 silencia; se ve quién habla
(AnalyserNode). Al cambiar de circuito cuelga y vuelve a conectar sola. Probado: 3 aparatos en memoria y 2 con el
emulador de Firebase y las reglas (14 casos de reglas). Reglas pegadas por el usuario el 22-11; falta probarlo entre dos casas. Si alguien no conecta
nunca (redes de empresa, algunos datos móviles), haría falta TURN (Cloudflare Realtime TURN, credenciales por el Worker).

22-11 (2): 📻 radio en el recorrido (`musica/radio.ts` + `components/MenuRadio.tsx`, botón junto a 🤖 Bots): 6 estilos
(Reguetón, EDM, Rock clásico, Éxitos actuales, Heavy metal, «Estilo GTA» = G-funk de la costa oeste + synthwave; la música
de los juegos de verdad no, tiene derechos). Emisoras reales de internet elegidas en Radio Browser (más votadas, HTTPS,
sin anuncios si se puede); se pide la dirección al día con `/json/url/{uuid}` (de1/nl1/at1, CORS abierto) y, si fallan
todas, busca otra por etiqueta. Se dice qué emisora suena; «🔀 Otra» pasa a la siguiente del estilo. Fundido de 2 s y
bajar la radio cuando habla un amigo por el micro (no en iOS: el volumen de una web no se puede tocar). 🎛️ DJ automático
(`DjAutomatico`, clave `rodillos.radioDj`): ≥ 88 % del FTP 5 s → EDM; < 75 % 45 s seguidos → tu emisora; mínimo 90 s en
cada una (las 30″/30″ no la cambian). Sin reglas nuevas. El usuario confirma el 22-11 que la radio funciona perfectamente.

21-11 (3): la conexión con TriCoach va con la cuenta (`perfil.tricoach`, se sincroniza con el perfil; sin reglas nuevas):
al conectar en un aparato sale en todos (la app instalada en el PC de Jesús no tenía el token del otro navegador). En
TriCoach Entrenos, las sesiones de RideCrew («… · rodillo» en Strava) solo se emparejan con el entreno del mismo título. Confirmado por el
usuario el 22-11: la carpeta ya sale en el portátil y el emparejamiento es correcto.

23-11: Tacx por «FE-C sobre Bluetooth» (amigo con Tacx Flow Smart 2020: Zwift y MyWhoosh le hacen ERG, RideCrew no lo
encontraba porque solo buscaba FTMS 0x1826). `RodilloFtms` busca también el servicio Tacx `6e40fec1-…` y nombres «Tacx»;
si no hay FTMS usa FEC2 (notificaciones: páginas 16 y 25 → velocidad, cadencia, vatios) y FEC3 (órdenes: mensaje ANT
`A4 09 4F 05 <página> XOR`; páginas 49 ERG, 50 viento/rebufo, 51 pendiente). Misma tarjeta «Rodillo inteligente». Sin
probar con el aparato.

23-11 (2): sitios para parar (idea de los amigos de Jesús): una ⛽ gasolinera, una ☕ cafetería, un 🍺 bar y un 💆 fisio por
circuito (`recorrido/paradas.ts`, `PARADAS`; en la sierra en los tramos suaves: en rampa el talud tapaba el edificio).
Edificios sencillos en `escena.crearParadas` (lado derecho salvo agua; sin vallas, árboles ni casas encima: `sinParadas` y
`enLago`). Aviso a 600 m «Parar / Seguir» (`AvisoParada`, como el de los cruces); al elegir parar, el ciclista va al
arcén (`escena.irAlArcen`) y al llegar sale la pantalla de dentro (`DentroParada`) con el menú: se paga con RideCoins y se
toma al momento, sustituye al efecto que hubiera (`comprarEnParada` en App). Menús en `NUTRICION` con `parada`
(fuera de la tienda: `NUTRICION_TIENDA`): helado «Mas y Von» 70 (+5 %, 8′), bebida energética + donut 95 (+6 %,
12′), refresco de cola + pincho de tortilla 85 (+5 %, 10′), café + tostadas 80 (+5 %, 10′), masaje de piernas 90 (+3 %,
20′). Sin marcas (ni Maxibon ni Red Bull ni Coca-Cola). El entreno, el ERG, el tiempo y los km siguen; al salir el ciclista
está donde le toca por lo pedaleado. Pegado a otro no se para. Sin reglas nuevas.
23-11 (3): «⬆️ Seguir» no quitaba el aviso (solo ponía «no parar»): ahora `seguidoEn` (App) lo esconde hasta pasar
ese sitio (vuelve en la vuelta siguiente); «Seguir sin tomar nada» también olvida la parada.
Botón de salir según el sitio (`salir` en `INFO_PARADA`: «Seguir sin masaje» en el fisio). El emoji 🪙 sale como un
cuadrado en Windows 10: en pantalla va `<Moneda />` (components/Moneda.tsx, moneda dorada con «R» en CSS, `.moneda`).
23-11 (4): RideCoins de regalo para que el administrador lo pruebe todo: `despensa.regalo` (contador que solo sube, se suma al
saldo; al sincronizar gana el mayor). Los primeros 10.000 se ponen solos tras sincronizar; más con «🎁 Añadirme 10.000» en la
tienda (solo `soyAdmin`). Sin reglas nuevas.

23-11 (5): 5.º circuito, «Velódromo Juan sin cabra» (`id: 'velodromo'`, `paisaje: 'velodromo'`, sala `velodromo`; las reglas
ya valen para cualquier sala): óvalo de 1 km (`forma.ovalo`: rectas de 200 m y curvas de radio ~95 m, en `trazadoDe`), llano.
En escena.ts (`this.ovalo`): peralte en las curvas (`prepararVelodromo`/`alzado`: ~22°, el borde de dentro a ras y el de
fuera sube; lo usan `cinta` y `puntoEn`, así que ciclistas y cámara van sobre él), pista de hormigón liso con franja azul
y líneas negra/roja/azul, valla azul con carteles, gradas con público instanciado, focos y el nombre en lo alto
(`crearPistaVelodromo`, `crearGradasVelodromo`); sin quitamiedos, taludes ni público de meta; terreno llano dentro y nada
de árboles ni casas a < 55 m (`distanciaOvalo` en `enLago`). Salidas: dos cruces en la recta de enfrente (km 0,46 y
0,54, a los otros 4 circuitos; sin valla ni gradas ahí) que solo se abren cada 5 vueltas dadas dentro
(`salidaCadaVueltas`, `inicioCircuitoRef` en App); aviso «🏟️ Vuelta N · salida en M vueltas» (`.aviso-velodromo`).
Entradas: un lado libre de un cruce de cada circuito (Lago km 1 y Ribera km 18,5 izquierda; Sierra km 12 izquierda;
Faro km 11 derecha). Prueba: `pruebas/velodromo.html?s=…&v=trasera|lateral|cenital`.

23-11 (6): 〰️ horquilla (idea de Jesús: en la calle un 8×4′ a 240 W se hace a 230-250 W con media 240). `horquilla` (W: 5, 10,
15 o 20, `HORQUILLAS`) en los bloques constantes y en la parte dura de las series (editor: «〰️ Horquilla No/±N W»; se
comparte, `validar` en compartidos.ts) y en `Tramo`. Para cualquier entreno (también el catálogo), en los mandos del
entreno del recorrido «〰️ Sin horquilla / Horquilla ±N W» (clave `rodillos.horquilla`): `desplegar(bloques, horquillaGeneral)`
la pone en los tramos constantes de ≥ 1′ y ≥ 76 % del FTP (la del bloque manda). `oscilacionW(tramo, t)` (tipos.ts): puntos
cada ~18 s alternando arriba y abajo (semilla = inicio del tramo), unidos con rectas, empieza y acaba en el objetivo, nunca
pasa de ±N y la media del tramo es exactamente 0; App la suma a `objetivoW` (el ERG la recibe cada segundo). En el panel:
«〰️ media 240 W (±10)». El TSS planificado no cambia.

24-11: regalar RideCoins a otras cuentas (Jesús, para un amigo nuevo que va a probar la web): en el panel 🛡️, columna
«RideCoins» con «🎁 +10.000» (`regalarMonedas`, transacción en `regalos/{uid}` = total regalado, solo sube). Cada cuenta lo
escucha (`escucharMisRegalos`) y se suma a su saldo en App (`regaloNube`), al momento. Reglas: `regalos` lo lee el
administrador, cada `$uid` lo lee su dueño y solo escribe el administrador. Reglas pegadas por el usuario el 24-11: funciona.
24-11 (2): borrar una sesión en el historial no tocaba el ranking (`totales/{uid}`): ahora `Historial` avisa (`onBorrado` →
`versionHistorial`) y, sin sesiones, se publican totales a 0, pero solo con la nube ya sincronizada (`sync.tipo === 'ok'`).
Cuentas de prueba: el administrador no puede borrar datos de otros desde la web; se borran a mano en la consola de Firebase
(`totales`, `fichas`, `usuarios`, `regalos` con su uid, y la cuenta en Authentication).
24-11 (3): «🗑️ Borrar cuenta» en el panel 🛡️ (`borrarCuenta` en admin.ts): pone `bloqueados/{uid}: true` y borra de una vez
`totales`, `usuarios`, `fichas`, `regalos`, sus `records` y sus `compartidos`. Reglas: `totales`, `records`, `usuarios` y
`fichas` solo dejan escribir al dueño si no está bloqueado, y al administrador solo borrar; `bloqueados` lo escribe el
administrador y cada uno lee el suyo. Al entrar con una cuenta bloqueada sale un aviso y se cierra la sesión
(`cuentaBloqueada`). La cuenta de Authentication queda (no se puede borrar la de otro desde la web). Reglas probadas en el
emulador (10 casos). **Necesita las reglas nuevas pegadas.**
25-11: «Error de Bluetooth (2)» en iPhone/iPad con Bluefy en todo (KICKR CORE de Raúl, Suito y pulsómetro de José; en
ordenador iba bien). Causa probable: conexiones GATT «viejas» que iOS da por conectadas (de antes de recargar la web o de
un intento fallido) y responden 2 a todo; los reintentos se hacían sobre la misma conexión sin soltarla. Ahora (SensorBle):
si al conectar `gatt.connected` ya es true se suelta antes; ante un error nativo (número suelto, `esErrorNativo`) se suelta
del todo antes de reintentar (`soltar`); al fallar siempre se llama a `disconnect()`; en iOS no hay reconexión automática
con `getDevices` (`esIos`); la búsqueda del aparato recordado ya no mezcla `namePrefix` con el nombre. Probado con un
Bluetooth simulado que se comporta así (la versión anterior daba los mismos mensajes del Registro). Falta confirmarlo con
José y Raúl.
25-11 (2): no era eso (el iPad de Jesús seguía igual): el aviso salía sin «No se pudo conectar con…», o sea que fallaba
`requestDevice` (la búsqueda), no la conexión. Desde el 23-11 (Tacx) el rodillo buscaba también por el servicio de 128 bits
de Tacx y por `namePrefix`, y Bluefy rechaza esa búsqueda con «2». En iOS (`esIos`) el rodillo vuelve a buscar solo FTMS
(igual que antes del 23-11) y el potenciómetro solo Cycling Power (sin el servicio de Elite). Los Tacx sin FTMS y los Elite
antiguos solo se encuentran en ordenador/Android. Pendiente: confirmación de Jesús en su iPad.
25-11 (3): seguía fallando en todo, también el CSC (búsqueda sin tocar): Bluefy rechazaba `requestDevice` con «2» fuera cual
fuera el aparato. Otros proyectos con Bluefy: los códigos cortos en número (0x1826) fallan y con el código completo en texto
funcionan, y un número suelto puede ser el estado del Bluetooth de iOS (2 = aún no listo). Ahora en iOS (SensorBle):
`buscar()` manda las opciones con `uuidCompleto` (00001826-0000-1000-8000-00805f9b34fb) y, si rechaza con un número,
reintenta 2 veces (1,2 s) y la última sin `optionalServices`; y `configurar` recibe el servidor envuelto
(`servidorConCodigosCompletos`) para pedir servicios y características con el código completo. En ordenador, igual que
antes. Probado con un Bluefy simulado que rechaza los códigos cortos (la versión anterior daba el mismo error de la captura).
25-11 (4): Eric «otra vez sin datos». Fallo encontrado: con el navegador sin datos (le pasa a menudo), el efecto que regala
el material que ya se llevaba (`regalarMaterial`) llamaba a `cambiarPerfil` ANTES de terminar la primera sincronización y
ponía `rodillos.perfil.t` = ahora, así que `Nube.sincronizar` veía el perfil por defecto como «más nuevo» y lo SUBÍA encima
del de la nube (FTP, peso, ciclista, edad…; el historial no se pierde: se junta, y la despensa gana el mayor). Ahora la
primera sincronización usa la fecha del perfil al abrir la web (`perfilTAlAbrir`) y el regalo de material espera a
`sync.tipo === 'ok'`. Lo que ya se pisó en la nube no se puede recuperar: Eric tiene que volver a poner FTP, peso y ciclista.
25-11 (5): **quedadas** (idea de Jesús). Cada circuito es una quedada: `salas/{sala}/quedada` = { anfitrion, nombre, modo
'juntos'|'libre', suministros, cambio (hora del aparato: con serverTimestamp llega dos veces), s } (useSalida: `quedada`,
`serAnfitrion(nueva)`, `cambiarQuedada`). Anfitrión: el creador de la salida programada (`creadorProgramadaRef` en
`entrarProgramada`) o, si falta, el de uid menor de los presentes; solo en el circuito → quedada nueva (juntos, sin
suministros). Con alguien más (`enQuedada`): por defecto todos juntos, tira el de más `vp` (velocidad que llevaría él solo,
publicada en su nodo; todos calculan lo mismo con los datos publicados) y los demás van pegados (`liderJuntosRef`, el mismo
mecanismo de «Siempre juntos»), sin rebufo (`sinRebufoRef`). «Soltarme» → `suelto` (hasta que reagrupen). Mandos del
anfitrión (`.panel-quedada`): «🏁 ¡Carrera libre!» (cada uno con sus vatios y rebufo, salen del mismo punto), «🤝 Reagrupar»
(todos al punto del que va en cabeza, `s`) y «🍬 Suministros sí/no». Geles, tienda y paradas solo con `suministrosOk` (sin
quedada, siempre). Aviso grande para todos (`.aviso-quedada`, 7 s). Reglas: `quedada` la escribe su anfitrión o quien se
pone de anfitrión; `vp` y `suelto` en los ciclistas (si no están pegadas, el nodo se publica sin ellos). Probado: reglas en el
emulador (11 casos) y compilación; falta probarlo entre varios. **Necesita las reglas nuevas pegadas.**
25-11 (6): Eric: «pantalla negra al empezar un entreno» tras publicar las quedadas. No se reproduce aquí (probado con el
emulador de Firebase y cuentas de prueba: empezar, retomar sesión a medias, elegir otro entreno al reabrir, dos cuentas a la
vez). Añadido `ProteccionErrores` (main.tsx): si React falla al pintar, en vez de negro sale el error y «Recargar» (para la
captura). Arreglado: al entrar en una sala, durante 4 s no se decide el anfitrión (`dentroDesdeRef`; antes, la lista aún no
había llegado, parecía estar solo y le quitaba el mando al que ya estaba y reiniciaba la quedada), y «¡Reagrupados!» solo se
anuncia si venía de carrera libre. **Prueba con el emulador** (solo en desarrollo): `firebase emulators:start --only
database,auth` (auth 9099, database 9123, proyecto ciclismo-amigos, reglas de firebase/) y abrir `http://localhost:5173/?emulador`
(firebase.ts conecta al emulador); las cuentas de prueba se crean con `accounts:signUp` del emulador de auth.
25-11 (7): la causa de la pantalla de Eric (captura: ventana de la app instalada vacía, ni cabecera): al publicar, GitHub
Pages borra los archivos de la versión anterior; con la página vieja aún guardada (caché de ~10 min) o la web abierta de
antes, al pedir una pieza que ya no existe (`VistaRecorrido` es `lazy`: se descarga al pulsar «Empezar») la web se quedaba
vacía. Hoy se publicó muchas veces. Ahora `index.html` (script en línea) recarga sola con `?v=` si falla un archivo de
`/assets/` o salta `vite:preloadError` (como mucho una vez cada 30 s, `rodillos.recargaVersion` en sessionStorage) y, si a
los 15 s no ha arrancado, enseña «RideCrew no ha terminado de cargar» con un botón; `ProteccionErrores` también recarga ante
un fallo de importación. Probado quitando el archivo principal: recarga una vez y luego enseña el botón.
25-11 (8): Eric: «tu primer tiempo» en subidas ya hechas. Mis marcas personales solo estaban en el navegador
(`rodillos.records`); ahora, tras sincronizar, `recuperarMisMarcas()` (records.ts) las rehace con mis filas de
`records/{circuito}/{segmento}/{uid}` (se queda la mejor). Probado con el emulador. El fantasma (mejor vuelta) sigue solo en
el navegador. Diagnóstico de Eric: la VPN no borra nada (cambia la IP, no el almacenamiento); sospecha principal: el portátil
es del trabajo y Chrome está gestionado por la empresa (política que borra datos al cerrar o cookies «solo de sesión»), o se
abre RideCrew desde perfiles de Chrome distintos (él y su mujer). Mirar `chrome://policy` y `chrome://management`.

26-11: la conexión con Strava va con la cuenta (Jesús tuvo que conectarla otra vez en el iPhone; a Eric se le borraba con
los datos del navegador): `usuarios/{uid}/strava` = { refresh, atleta, atletaId, t } o { desconectado: true, t }
(`strava/stravaNube.ts`, `sincronizarStravaConNube` en App; gana el `t` más reciente, `rodillos.strava.t`). Conectar,
renovar el token al subir y desconectar se mandan a la nube (`establecerEspejoStrava`); la casilla de subida automática es de
cada aparato. Solo la lee su dueño (el administrador no). Probado: reglas en el emulador (9 casos) y dos aparatos con el
emulador (el nuevo la recibe; desconectar en uno desconecta en todos). **Necesita las reglas nuevas pegadas.**
Cabecera: el botón de la pantalla en la que se está (🛡️, cuenta o Ajustes) sale en verde (`.en-pantalla`); antes el de la
cuenta estaba siempre en verde.

26-11 (2): revisión del engranaje y plan para crecer a 100+ ciclistas gratis (Firebase Spark: 10 GB/mes de descarga,
100 conexiones; el 26-11 iba por ~200 MB/semana). **Sin reglas nuevas.**
1) `Nube.sincronizar` ya no lee `usuarios/{uid}` entero (bajaba las muestras de todas las sesiones en cada apertura): lee
perfil, propios, historial y borrados; las muestras solo de las sesiones que falten (`bajarEntreno`).
2) Varias cuentas en el mismo navegador (matrimonio en el mismo ordenador): `cuenta/cambioCuenta.ts`. `rodillos.cuenta` =
uid dueño de lo guardado. «Cerrar sesión» (`cerrarSesionSegura` en App) sincroniza y comprueba que todas las sesiones de
aquí están en la nube (si no hay red, no cierra; máx. 25 s), y con una sesión a medias tampoco; luego `signOut`,
`vaciarDatosPersonales` (claves `PERSONALES` + `rodillos.fantasma.*` + IndexedDB del historial; lo del aparato se queda) y
recarga. Si entra una cuenta distinta de la dueña, se vacía y recarga antes de sincronizar; totales, ficha y Strava no se
publican mientras la dueña no sea la cuenta. Sin dueña (navegador nuevo, vaciado o de antes) el perfil local nunca gana al
de la nube (`perfilT = 0`). **Fallo grave arreglado**: el regalo de material (`regalarMaterial`) corría en la pantalla de
entrar (sin cuenta), ponía `rodillos.perfil.t` = ahora y, al entrar en un navegador nuevo o vacío, el perfil por defecto
(FTP 200, peso 75) pisaba el de la nube: probablemente lo que le pasaba a Eric.
3) Entrenos propios borrados: `borrados/p_{id}` (`apuntarPropiosBorrados`, pendientes en `rodillos.propiosBorrados` hasta
subirlos con `subirPropios`); `recibido` (Weekend Warriors) más nuevo que el borrado lo deja volver.
4) Compartidos: caché en `rodillos.compartidosCache`; en directo solo en Entrenamientos/crear; al rodar, la guardada (o
una lectura si no hay).
5) Con la web oculta 2 min y sin rodar, `goOffline` (vuelve con `goOnline`).
Probado con el emulador: navegador de antes, dos aparatos, borrar propio, sin internet, Ana → Beto → Ana, dueña distinta
(11 casos) y la caché de compartidos.

26-11 (3): José (iPad, Bluefy; ya conecta tras el arreglo de los códigos completos) perdía rodillo y banda a la vez al
tomar un desvío: cada cambio de circuito (`key={circuitoId}` en App) desmontaba `VistaRecorrido` y la escena destruía
el WebGLRenderer y forzaba la pérdida del contexto, y la nueva creaba otro (pico de memoria y trabajo en iOS). Ahora el
motor se reutiliza (`tomarMotor`/`dejarMotor` en escena.ts: queda 8 s guardado al destruir; solo con el mismo suavizado y
sin contexto perdido; si nadie lo recoge, se libera como antes; los mapas de sombras se sueltan a mano). Probado: 8 cambios
seguidos sin contextos nuevos y memoria estable. **Arreglado también**: el velódromo rompía el recorrido (`infoSubidas`
sin subidas → `SUBIDAS[0]` undefined); ahora `proxima: null` y el perfil dice «Circuito llano». Pendiente: que José
confirme si ya no se cae el Bluetooth en los desvíos (y si reconectó solo o pulsando).

### Probado
- iPad con Bluefy: va fluido (confirmado por el usuario el 27-09).

### Próximos pasos
- **Comprobar el consumo de Firebase el 02-12-2026** (Jesús lo pidió; hay un recordatorio programado): captura de Realtime
  Database → Uso. Antes de los arreglos del 26-11: **203 MB de descarga en 7 días** (+235 % sobre la semana anterior),
  6,44 MB guardados, plan Spark (10 GB/mes). Si ha bajado, apuntarlo; si no, buscar qué más descarga.
- **Elite Turbo Muin** (25-11, amigo nuevo): rodillo de fluido sin palanca ni control (el apaño de la palanca 1-8 es del
  Novo Force de Aitor, magnético: no sirve aquí). Hace falta un sensor: Misuro B+ (vatios con la curva de Elite; en
  ordenador/Android sale en «Potenciómetro»; en iPhone/iPad, con «Ver todos», sin probar) o, mejor y más barato, un sensor
  de velocidad Bluetooth normal. Propuesto añadir el preset «Elite Turbo Muin» en `potenciaVirtual.ts` (buscar su curva
  publicada o calibrar con un dato suyo). Jesús lo guardó para más adelante.
- **Paco Lara** (25-11, pendiente): Van Rysel D100 (vatios, sin cadencia) + Zwift Cog, sin pedales ni sensor de cadencia. En
  ERG no hay problema (la marcha no cuenta y la protección del ERG mira los vatios). En «Rodar libre» los cambios virtuales
  no hacen nada (`potenciaMarcha` necesita la cadencia) y con una sola marcha física las subidas se le harán muy duras.
  Soluciones propuestas: sensor de cadencia (20-30 €, lo recomendado) o calcular la cadencia con la velocidad del rodillo
  (con el Cog la relación es fija; calibrar una vez pedaleando a cadencia conocida). Jesús decide. Luis Sendra (KICKR CORE
  + Zwift Cog: el rodillo da cadencia) y Daniel de la Cruz (D100 + Assioma para la cadencia) no tienen problema.
- **Strava: ampliar plazas — SOLICITUD ENVIADA el 25-11-2026** (10/10 conectados, nivel estándar; pedidas 100 plazas;
  Support URL `https://tricoach.es`, nombre de la app «TriCoach»; descripción: solo RideCrew + Entrenos). Esperar respuesta
  por correo de Strava. Ese mismo día el generador de tricoach.es (repo `Tri-Coach`) dejó de usar Strava (mandaba 60 días de
  actividades a Claude: zona gris con las normas de Strava); ahora pide el historial en un formulario. No cambiar el dominio
  de callback `tricoach.es` de la app de Strava (lo usan RideCrew y Entrenos). Antes: la app 257751 (RideCrew + TriCoach Entrenos + generador) está en 10 atletas y casi
  llena. Solicitud por el formulario del Developer Program de Strava (no por correo); preparada la justificación (RideCrew
  solo `activity:write`, botones y logos oficiales, `public/privacidad.html` es/en). Ojo: Entrenos enseña datos de Strava
  del deportista al entrenador; el acuerdo de la API lo deja en zona gris (más de 9.999 plazas no; por debajo, dudoso):
  decirlo con claridad en la solicitud. Plan B: una app de Strava aparte para RideCrew (otra cuenta de Strava, 10 plazas
  sin revisión).
- Ideas del usuario del 21-11 (el micro ya está hecho, 22-11). 2) **Música según vatios/pulso**: Amazon Music no tiene API para
  webs; Spotify sin «audio features» para apps nuevas y desde 2026 el modo desarrollo exige Premium y máx. 5 usuarios;
  viable: canciones propias subidas una vez a la web (IndexedDB, el BPM lo calcula RideCrew) o dos listas de YouTube
  (suave/caña) que cambian con el bloque. Hecho el 22-11 el **modo radio** (ver arriba); idea original: un **modo radio** con 3-4 emisoras «a lo GTA» para
  todos sin preparar nada: emisoras reales por internet (Radio Browser API, gratis y abierta; solo enlaces HTTPS; no
  renombrarlas como nuestras, se dice cuál suena) y «DJ automático» que cambia de emisora entre series y descansos.
  Pendiente de su visto bueno y de los estilos. 3) **intervals.icu**: API con OAuth (hay que pedir alta de app) o clave
  personal; subir sesiones (FIT) y leer entrenos planificados del calendario. Ojo: en TriCoach Entrenos se descartó
  intervals.icu para mandar entrenos al Garmin; aquí sería otra cosa (RideCrew ↔ intervals).
- Ideas de marketing de TriCoach que el usuario guardó para más adelante (21-11): 1) firma en Strava de los entrenos
  de TriCoach («Entreno de TriCoach · tricoach.es» en la descripción); 2) mini ficha al tocar la etiqueta «Entreno de
  TriCoach» (logo, qué ofrece, enlace o WhatsApp de contacto); 4) entreno destacado de la semana (Jesús elige uno y sale
  el primero en Compartidos con ⭐ «Recomendado por TriCoach»); 6) invitación al terminar: si quien completa un entreno
  de TriCoach no es deportista suyo (sin conexión con TriCoach Entrenos), el sello final añade «¿Quieres un plan hecho a
  tu medida? Escribe a TriCoach» con enlace a WhatsApp o formulario (falta que Jesús dé el contacto). Ir proponiéndole
  más; él decide ahora o más adelante.
- 17-11: Strava pasa a identificadores de 64 bits el 1-6-2027. Ya preparado (`jsonStrava` en `servidor-strava/worker.js`
  y en `worker/stravaJson.js` de TriCoach Entrenos: los de 16 cifras o más se leen como texto). Comprobar antes de junio
  de 2027 que el Worker `strava-rodillos` tiene esta versión (si no se publica solo con Workers Builds, desplegarlo).
- Pendientes propuestas al usuario el 04-11 (las dejó para más adelante): pitidos 3-2-1 en los cambios de bloque
  de los entrenos (con opción de quitarlos); retos de la semana con RideCoins (3 sesiones, 100 km, salida con un
  amigo); que el entreno del día puesto en TriCoach Entrenos salga solo en RideCrew y se marque hecho allí (unir
  las webs con el Worker; comprobar antes que no añade pasos al deportista); carreras de grupo sobre las salidas
  programadas (salida a la vez, meta a X km, clasificación en el chat; necesita reglas nuevas).
- Aparcado el 09-11 (el usuario lo pidió dejar en memoria): avisar con una notificación cuando un amigo empiece a
  rodar. Telegram descartado (no se puede obligar a instalarlo). Plan acordado: Web Push. Android (Chrome): permitir y
  listo. iPhone/iPad: solo instalando la web en la pantalla de inicio desde Safari (iOS 16.4+; Bluefy no admite push),
  se sigue rodando en Bluefy. Envío desde el Worker de Strava: suscripciones en Cloudflare KV (sin tocar reglas de
  Firebase), clave VAPID privada como secreto del Worker (generada desde el panel 🛡️), aviso al entrar al recorrido
  (ID token), máximo uno por amigo cada ~2 h, casilla en Ajustes. Pasos del usuario en el PC: crear el KV y pegar el
  secreto. Antes, comprobar con el usuario que «Amigos rodando ahora» funciona (prueba los dos a la vez).
- Probar en el iPad el paso 4 (memoria y fps con los modelos escaneados).
- Posible cambio de nombre de la web (el usuario tiene opciones; ver niveles: solo nombre visible,
  renombrar el repositorio o dominio propio).
- Cuentas de usuario e historial en Firebase.
- Integración con Strava a través del NAS del amigo.
- Compartir entre amigos los entrenamientos creados.

## Backend decidido

- **Firebase** en la nube para los usuarios, el historial y la salida en grupo. No proponer Supabase.
- **NAS del amigo** (UGREEN DXP8800 Plus con Unraid y Docker, 14 GB de RAM, siempre encendido y
  con HTTPS) para el servidor de Strava y la lógica multijugador que necesite backend propio.
