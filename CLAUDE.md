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
  Logros (`logros.ts`, 90 por categorías; subir `VERSION_LOGROS` al añadir más para no celebrar
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

### Probado
- iPad con Bluefy: va fluido (confirmado por el usuario el 27-09).

### Próximos pasos
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
