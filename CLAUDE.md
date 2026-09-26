# Ciclismo amigos: web de rodillos

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
- `src/entrenamientos/`: catálogo de 36 entrenamientos (`catalogo.ts`, potencias en % del FTP),
  entrenamientos propios (`propios.ts`, se guardan en el navegador) y tipos.
- `src/entrenamiento/`: grabación de la sesión, resumen, exportación TCX y almacén del historial.
- `src/multijugador/`: Firebase y el hook `useSalida` para la salida en grupo.
- `src/components/`: pantallas y paneles de React.
- `firebase/database.rules.json`: reglas de la Realtime Database. Si cambian, el usuario tiene
  que pegarlas a mano en la consola de Firebase.
- `public/modelos` y `public/texturas`: recursos CC0 (Quaternius, Poly Haven); créditos en
  `public/CREDITOS.md`.
- Texturas del suelo en KTX2 (comprimidas para la GPU, clave para que el iPad no se quede sin
  memoria) junto a los JPG de respaldo. Si se cambia un JPG, regenerar con
  `herramientas/comprimir-texturas.mjs`. El transcodificador está en `public/basis/`.
- En iPhone/iPad (`esDispositivoIos()`): sin MSAA, resolución ≤ 1,25, sombras 1024, cielo 2k.
  Si se pierde el contexto WebGL, `VistaRecorrido` recrea la escena en calidad media.
- `pruebas/`: páginas de prueba locales (en `.gitignore`), p. ej.
  `pruebas/ciclista.html?vista=lado|manos|pies|cockpit|bici|transmision|cabeza…&modelo=…&casco=…`.

## Estado actual (2026-09-26)

Publicado: commit `9d2cb19` (26-09-2026 por la noche):
- Marcador del recorrido en la barra superior, en dos filas; el centro queda libre.
- Bici nueva: geometría real (la rueda ya no toca el cuadro), cuadro y cockpit de una pieza
  con uniones suaves, logotipo en el diagonal, manetas, cadena de eslabones, discos perforados.
- Postura: tronco inclinado para llegar al manillar, manos agarrando las manetas; en la cabra,
  codos en los reposabrazos y puños en las puntas del acople.
- Casco rígido de verdad (grosor, rejillas con paredes de espuma, banda fina) y zapatillas.
- Generar las mallas cuesta unos 2-3 s la primera vez; luego se leen de IndexedDB.

### Pendiente de probar
- Rendimiento en iPad con Bluefy (fps y carga de unos 30 MB). En el navegador de escritorio de
  Claude iba a unos 30 fps con cerca de 1 M de triángulos en calidad alta.

### Próximos pasos
- Cuentas de usuario e historial en Firebase.
- Integración con Strava a través del NAS del amigo.
- Compartir entre amigos los entrenamientos creados.

## Backend decidido

- **Firebase** en la nube para los usuarios, el historial y la salida en grupo. No proponer Supabase.
- **NAS del amigo** (UGREEN DXP8800 Plus con Unraid y Docker, 14 GB de RAM, siempre encendido y
  con HTTPS) para el servidor de Strava y la lógica multijugador que necesite backend propio.
