# Prueba de rodillos (Web Bluetooth)

Web sin backend para conectar y probar rodillos de ciclismo y sensores por Bluetooth LE
directamente desde el navegador.

- **Chrome** en PC / Mac / Android.
- **Bluefy** en iPad / iPhone (Safari no soporta Web Bluetooth).

Stack: Vite + React + TypeScript.

## Ejecutar en local

Necesitas [Node.js](https://nodejs.org/) 18 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en Chrome.

> Web Bluetooth solo funciona en **contexto seguro**: `https://` o `http://localhost`.

### Probar desde el iPad o el iPhone (Bluefy) en la red local

Desde otro dispositivo la dirección ya no es `localhost`, así que hace falta HTTPS:

```bash
npm run dev:https
```

Abre en Bluefy la dirección `https://<IP-del-ordenador>:5173` que muestra la consola y
acepta el aviso del certificado autofirmado.
Otra opción es usar la URL `https://` que te da Replit.

### Otros comandos

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Comprueba los tipos y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la versión compilada |
| `npm run typecheck` | Solo comprueba los tipos de TypeScript |

## Qué hace

### Conexión (un botón por dispositivo)

Cada botón llama a `navigator.bluetooth.requestDevice` en el propio clic (el navegador exige
un gesto del usuario).

| Botón | Servicio | Características |
| --- | --- | --- |
| Rodillo FTMS | `0x1826` | Indoor Bike Data `0x2AD2` (potencia, cadencia, velocidad), Supported Power Range `0x2AD8` (si existe), Control Point `0x2AD9` |
| Potenciómetro | `0x1818` | Cycling Power Measurement `0x2A63` (potencia y, si la envía, cadencia) |
| Sensor velocidad/cadencia | `0x1816` | CSC Measurement `0x2A5B` |
| Pulsómetro | `0x180D` | Heart Rate Measurement `0x2A37` |

Al conectar el rodillo se envían por el Control Point **Request Control (`0x00`)** y
**Start (`0x07`)**.

Si un dispositivo se desconecta sin que lo pidas, la app **reintenta la conexión sola**
(esperando 1 s, 2 s, 4 s… hasta 15 s, un máximo de 10 intentos). Si falla la conexión, se
muestra el motivo bajo el botón y en el registro.

### Panel en directo

Vatios, cadencia, velocidad, pulso, vatios medios, velocidad media y tiempo. Los botones
**Iniciar / Pausar / Reiniciar** controlan el tiempo y las medias (una muestra por segundo).

Si hay varias fuentes para un mismo dato, se usa esta prioridad (la fuente aparece bajo el valor):

- Potencia: potenciómetro → rodillo FTMS → estimada con el sensor de velocidad.
- Cadencia: potenciómetro → sensor de cadencia → rodillo FTMS.
- Velocidad: rodillo FTMS → sensor de velocidad.
- Pulso: pulsómetro → rodillo FTMS.

Un dato de hace más de 3 segundos se considera perdido y se muestra `--`.

### Grabar el entrenamiento y subirlo a Strava

- **Iniciar / Pausar / Continuar**: mientras está en marcha se guarda una muestra por segundo
  (potencia, cadencia, velocidad, pulso) y se acumula la distancia.
- **Desnivel +**: solo existe en modo pendiente de un rodillo FTMS; se calcula con la pendiente
  simulada y la distancia recorrida.
- **Finalizar**: muestra el resumen, lo guarda en el historial y permite descargar un archivo
  `.tcx` para subirlo a mano en [strava.com/upload/select](https://www.strava.com/upload/select)
  (también vale para Garmin Connect, TrainingPeaks…).
- **Descartar**: borra el entrenamiento en curso sin guardarlo.
- Si se intenta cerrar la página con un entrenamiento sin finalizar, el navegador avisa.

### Salida en grupo (multijugador)

Escribe tu nombre y pulsa **Unirme a la salida**: verás en directo a todos los que estén en la
sala, con nombre, vatios, velocidad, cadencia y distancia (la distancia cuenta mientras el
entrenamiento está en marcha). Si alguien cierra la web o pierde la conexión, desaparece solo.

Funciona con **Firebase Realtime Database** (proyecto `ciclismo-amigos`, plan gratuito Spark):

- Cada dispositivo entra con una **identidad anónima** de Firebase Authentication.
- Estructura: `salas/{sala}/ciclistas/{uid} = { nombre, vatios, velocidad, cadencia, distancia, t }`,
  actualizada una vez por segundo. `onDisconnect()` borra el nodo al desconectarse.
- Las **reglas de seguridad** están en [`firebase/database.rules.json`](firebase/database.rules.json)
  (se pegan a mano en la consola → Realtime Database → Reglas). Solo usuarios autenticados leen,
  cada uno solo escribe su propio nodo y se validan campos y rangos.
- La configuración de Firebase en `src/multijugador/firebase.ts` no es secreta: está pensada para
  ir en la web pública. El SDK se carga solo al unirse a la salida.
- Se usa Realtime Database y no Firestore porque el plan Spark de Firestore limita las escrituras
  diarias, y aquí cada ciclista escribe una vez por segundo.

### Recorrido virtual (3D)

Botón **Entrar al recorrido**: escena 3D a pantalla completa con el ciclista en tercera persona.

- **Vuelta de 17 km con 150 m de desnivel positivo** (`src/recorrido/perfil.ts`): un puerto de
  2,5 km (+100 m, hasta ~6 %) y dos repechos de +25 m. El trazado, el terreno y los árboles se
  generan por código con semilla fija: todos ven el mismo mundo sin descargar modelos.
- **Velocidad virtual** (`src/recorrido/fisica.ts`): sale de los vatios, el peso (ciclista + 9 kg
  de bici) y la pendiente, con inercia, como en Zwift/MyWhoosh. Con un rodillo sin potencia se usa
  la potencia estimada.
- **Rodillo FTMS**: recibe la pendiente del recorrido automáticamente (cambios de 0,5 %).
- **Desnivel acumulado**: se suma a la grabación y al archivo TCX.
- **Modo demostración**: casilla para simular vatios sin rodillo, con un deslizador en pantalla.
- Los demás ciclistas de la *Salida en grupo* aparecen en la carretera con su nombre y avatar.
- Three.js se descarga solo al entrar en el recorrido o abrir el editor del avatar.

### Tu ciclista (avatar)

Colores de maillot, franja, culotte, casco y bici, tono de piel y peso. Al principio se asigna
una equipación al azar para que no vayáis todos iguales. El avatar se comparte en la salida en
grupo (`salas/{sala}/avatares/{uid}`); **el peso no se comparte**.

> Al actualizar desde una versión anterior hay que volver a pegar
> [`firebase/database.rules.json`](firebase/database.rules.json) en Realtime Database → Reglas;
> si no, los demás te verán con colores por defecto (el resto funciona igual).

### Historial

Totales acumulados (sesiones, horas, km, desnivel, kJ) y la lista de entrenamientos, con opción de
volver a descargar el `.tcx` o borrarlos. **Se guarda solo en el navegador del dispositivo**
(IndexedDB); más adelante se podrá sincronizar con una cuenta de usuario.

### Potencia estimada (rodillos sin medidor)

Con el sensor de velocidad se calcula:

```
velocidad (km/h) = vueltas de rueda por segundo × circunferencia (m) × 3,6
P (W) = a · v + b · v³
```

La circunferencia (por defecto 2105 mm, 700x25c) y los coeficientes `a` y `b` se pueden
editar. Hay varios presets; **solo el de Kurt Kinetic sale de una curva publicada** (convertida
de mph a km/h). El de **Tacx Blue Motion** corresponde a la posición 5 de la palanca, leída de la
gráfica de Tacx (~407 W a 60 km/h, lineal); no hay datos publicados para las otras posiciones.
Los demás son orientativos. Para calibrar, conecta a la vez un potenciómetro:
la app mostrará la potencia real y la estimada lado a lado. Los ajustes se guardan en el navegador.

### Controles de prueba (solo con rodillo FTMS conectado)

- **ERG**: escribe los vatios y pulsa *Fijar*. Envía Set Target Power (`0x05`).
- **Pendiente**: deslizador de −5 % a +16 %. Envía Set Indoor Bike Simulation (`0x11`) con
  viento 0, Crr 0,004 y Cw 0,51 kg/m.
- **Registro**: muestra cada comando enviado y la respuesta del rodillo (éxito o error).

## Estructura

```
src/
  ble/
    SensorBle.ts      Clase base: requestDevice, conexión, reconexión, cola GATT
    dispositivos.ts   Rodillo FTMS, potenciómetro, sensor CSC y pulsómetro
    parsers.ts        Interpretación de los bytes de cada característica
  components/         Piezas de la interfaz
  potenciaVirtual.ts  Fórmula y presets de potencia estimada
  App.tsx             Estado de la app y panel principal
```

## Importar en Replit

El proyecto no depende de nada de Replit. Al importarlo desde GitHub, basta con usar
`npm install` y `npm run dev`. El servidor de Vite ya escucha en todas las interfaces y
acepta dominios externos (`server.host` y `server.allowedHosts` en `vite.config.ts`).

### Arranque rápido en Windows

Haz doble clic en `iniciar-web.bat`: instala dependencias si faltan, arranca la web y abre Chrome en http://localhost:5173. Deja la ventana negra abierta mientras la uses; si la cierras, la web deja de cargar.

