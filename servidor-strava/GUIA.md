# Subida automática a Strava: lo que hay que hacer (una sola vez)

Tiempo: unos 20 minutos. Coste: 0 €. No hace falta dominio ni el servidor del amigo.

La web ya tiene todo el código. Solo faltan dos cuentas que tienen que ser tuyas:

1. Una **aplicación de Strava** (Strava te da un número y una clave secreta).
2. Un **intermediario en Cloudflare** (gratis), que guarda esa clave secreta, porque no
   puede ir dentro de la web: cualquiera podría verla.

---

## Parte 1. Crear la aplicación en Strava

1. Entra en **https://www.strava.com/settings/api** con tu cuenta de Strava.
2. Rellena el formulario:
   - **Application Name**: `Ciclismo amigos` (Strava no deja usar la palabra «Strava»).
   - **Category**: `Training`.
   - **Club**: vacío.
   - **Website**: `https://atletacuerdo.github.io/Ciclismo-amigos/`
   - **Application Description**: `Rodillo con amigos: sube los entrenamientos al terminar.`
   - **Authorization Callback Domain**: `atletacuerdo.github.io`
     (solo el dominio: sin `https://` y sin `/Ciclismo-amigos/`).
3. Acepta las condiciones y crea la aplicación. Te pedirá un **icono**: sirve cualquier
   imagen cuadrada (por ejemplo, una foto de tu bici).
4. En la página de la aplicación verás:
   - **Client ID**: un número, por ejemplo `123456`. **Este me lo puedes pasar**, no es secreto.
   - **Client Secret**: pulsa «show». **Este NO me lo pases por el chat**: lo pegarás tú en
     Cloudflare en la parte 2.

**Aviso sobre tus amigos:** Strava limita las aplicaciones nuevas a **1 atleta** (tú). Para
que se conecten los demás, en esa misma página de la API hay un enlace para pedir más
capacidad («athlete capacity» / programa de desarrolladores). Es gratis; lo revisan ellos y
puede tardar unos días. Mientras tanto, tú ya puedes usarlo.

---

## Parte 2. Crear el intermediario en Cloudflare

1. Crea una cuenta gratis en **https://dash.cloudflare.com/sign-up** (solo correo y contraseña;
   no pide tarjeta).
2. En el menú de la izquierda: **Workers & Pages** → **Create** → **Start with Hello World!**
   (o «Create Worker»).
3. Ponle de nombre `strava-rodillos` y pulsa **Deploy**.
4. Pulsa **Edit code**. Borra todo lo que hay y pega el contenido del archivo
   `servidor-strava/worker.js` de este proyecto. Pulsa **Deploy**.
5. Vuelve al Worker → pestaña **Settings** → **Variables and Secrets** → **Add**, y crea estas
   tres (después, **Deploy**):

   | Tipo | Nombre | Valor |
   | --- | --- | --- |
   | Text | `STRAVA_CLIENT_ID` | el Client ID de Strava |
   | **Secret** | `STRAVA_CLIENT_SECRET` | el Client Secret de Strava |
   | Text | `ORIGENES` | `https://atletacuerdo.github.io,http://localhost:5173` |

6. Copia la dirección del Worker, que aparece arriba: algo como
   `https://strava-rodillos.tunombre.workers.dev`.

---

## Parte 3. Pásame dos datos

Escríbeme en el chat:

- el **Client ID** de Strava;
- la **dirección del Worker**.

Yo los pongo en la web (archivo `.env.production`) y la publico. A partir de ahí:

- En **Ajustes → Strava**, cada uno pulsa **«Conectar con Strava»** una vez y da permiso.
- Al pulsar **«Terminar»**, el entrenamiento se sube solo, como **Virtual Ride**, con su nombre
  y un resumen. En el **Historial** hay un botón para subir también los antiguos.
- El permiso se guarda en cada dispositivo: en el iPad y en el PC hay que conectar una vez
  en cada uno.

## Preguntas rápidas

- **¿Cuánto cuesta Cloudflare?** Nada: el plan gratuito permite 100.000 peticiones al día y
  cada entrenamiento usa 2 o 3.
- **¿Quién ve mis datos?** El intermediario no guarda nada: recibe el archivo, lo manda a
  Strava y lo olvida. Tu permiso de Strava se queda en tu navegador.
- **¿Y si quiero quitarlo?** En Ajustes → Strava → «Desconectar Strava» (también retira el
  permiso en Strava).
