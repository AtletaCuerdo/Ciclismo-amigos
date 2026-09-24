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

### Potencia estimada (rodillos sin medidor)

Con el sensor de velocidad se calcula:

```
velocidad (km/h) = vueltas de rueda por segundo × circunferencia (m) × 3,6
P (W) = a · v + b · v³
```

La circunferencia (por defecto 2105 mm, 700x25c) y los coeficientes `a` y `b` se pueden
editar. Hay varios presets; **solo el de Kurt Kinetic sale de una curva publicada** (convertida
de mph a km/h). Los demás son orientativos. Para calibrar, conecta a la vez un potenciómetro:
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
