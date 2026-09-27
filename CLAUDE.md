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
- `src/entrenamientos/`: 128 entrenamientos: base (`catalogo.ts`) + biblioteca ampliada (`biblioteca.ts`,
  propia, basada en protocolos clásicos; potencias en % del FTP), importador de archivos .zwo/.mrc/.erg
  (`importar.ts`, categoría automática por intensidad),
  entrenamientos propios (`propios.ts`, se guardan en el navegador) y tipos.
- `src/entrenamiento/`: grabación de la sesión, resumen, exportación TCX y almacén del historial.
- `src/multijugador/`: Firebase y el hook `useSalida` para la salida en grupo.
- `src/cuenta/`: cuentas (Firebase Auth: Google y correo/contraseña; la anónima sigue para la salida
  en grupo) y sincronización «primero en local» en `usuarios/{uid}/…` (perfil, propios, historial,
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

Nombre visible provisional: **RideCrew** (título, cabecera, icono «RC», rotulación del maillot,
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

### Probado
- iPad con Bluefy: va fluido (confirmado por el usuario el 27-09).

### Próximos pasos
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
