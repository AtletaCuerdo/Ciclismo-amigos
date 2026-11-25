/**
 * Subida automática a Strava.
 *
 * - «Conectar con Strava» lleva a la página de permisos de Strava; al volver, la web recibe un
 *   código y el intermediario (servidor-strava/worker.js, en Cloudflare) lo canjea usando la
 *   clave secreta, que nunca está en la web.
 * - El permiso (refresh token) se guarda en el navegador y, con la cuenta, en `usuarios/{uid}/strava`
 *   (solo lo lee su dueño): conectado en un aparato, conectado en todos (stravaNube.ts).
 * - Al terminar un entrenamiento se envía el TCX al intermediario, que lo sube a Strava.
 *
 * Mientras no se rellenen VITE_STRAVA_CLIENT_ID y VITE_STRAVA_INTERMEDIARIO (en el archivo
 * .env.production, que se sube al repositorio: ninguno de los dos es secreto) todo queda oculto.
 */
import { generarTcx, prepararGeo } from '../entrenamiento/tcx';
import { fitBase64, generarFit } from '../entrenamiento/fit';
import type { Entreno } from '../entrenamiento/tipos';

/** Número de la aplicación creada en strava.com/settings/api (es público, no es secreto). */
export const STRAVA_CLIENT_ID: string = import.meta.env.VITE_STRAVA_CLIENT_ID ?? '';
/** Dirección del Worker de Cloudflare, p. ej. https://strava-rodillos.tunombre.workers.dev */
export const URL_INTERMEDIARIO: string = import.meta.env.VITE_STRAVA_INTERMEDIARIO ?? '';

const CLAVE = 'rodillos.strava';
const CLAVE_ESTADO = 'rodillos.strava.estado';
/** Cuándo se conectó, se renovó el permiso o se desconectó en este aparato (para comparar con la nube). */
const CLAVE_T = 'rodillos.strava.t';

/** Lo que se guarda en la nube: la conexión o, si se desconectó, solo `desconectado` (para que lo sepan los demás aparatos). */
export interface NubeStrava {
  refresh?: string;
  atleta?: string;
  atletaId?: number | string;
  desconectado?: boolean;
  t: number;
}
let espejo: ((n: NubeStrava) => void) | null = null;
/** La nube se apunta aquí para enterarse de cada cambio hecho en este aparato. */
export function establecerEspejoStrava(fn: ((n: NubeStrava) => void) | null) {
  espejo = fn;
}
export function marcaLocalStrava(): number {
  try {
    return Number(localStorage.getItem(CLAVE_T)) || 0;
  } catch {
    return 0;
  }
}
/** Estado de este aparato tal como iría a la nube (null si aquí nunca se ha conectado ni desconectado). */
export function estadoLocalStrava(): NubeStrava | null {
  const c = leerConexion();
  const t = marcaLocalStrava();
  if (c) return { refresh: c.refresh, atleta: c.atleta, atletaId: c.atletaId, t: t || Date.now() };
  return t ? { desconectado: true, t } : null;
}
/** Pone en este aparato lo que dice la nube (sin volver a subirlo). */
export function adoptarStravaDeNube(n: NubeStrava) {
  if (n.desconectado || !n.refresh) {
    if (leerConexion()) guardarConexion(null, { t: n.t, desdeNube: true });
    else guardarMarca(n.t);
    return;
  }
  const antes = leerConexion();
  guardarConexion(
    { refresh: n.refresh, atleta: n.atleta ?? antes?.atleta ?? '', atletaId: n.atletaId, auto: antes?.auto ?? true },
    { t: n.t, desdeNube: true },
  );
}
function guardarMarca(t: number) {
  try {
    localStorage.setItem(CLAVE_T, String(t));
  } catch {
    // sin almacenamiento
  }
}

export interface ConexionStrava {
  refresh: string;
  atleta: string;
  /** Número o, si es de los nuevos de más de 15 cifras, texto. */
  atletaId?: number | string;
  /** Subir sola cada sesión al terminar. */
  auto: boolean;
}

export function stravaDisponible() {
  return STRAVA_CLIENT_ID !== '' && URL_INTERMEDIARIO !== '';
}

export function leerConexion(): ConexionStrava | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return c && typeof c.refresh === 'string' ? { auto: true, ...c } : null;
  } catch {
    return null;
  }
}

/** En este aparato se ha conectado o desconectado Strava alguna vez (para el panel del administrador). */
const CLAVE_TOCADO = 'rodillos.stravaAqui';

/**
 * ¿Tiene Strava conectado? true o false si se ha conectado o desconectado en este aparato; undefined
 * si aquí nunca se ha tocado (puede que lo tenga conectado en otro aparato).
 */
export function estadoStravaAqui(): boolean | undefined {
  if (leerConexion()) return true;
  return tocadoAqui() ? false : undefined;
}

function tocadoAqui() {
  try {
    return !!localStorage.getItem(CLAVE_TOCADO);
  } catch {
    return false;
  }
}

/**
 * Guarda la conexión en este aparato. Salvo que venga de la nube o sea solo la casilla de subida
 * automática (que es de cada aparato), se apunta la hora y se manda a la nube.
 */
function guardarConexion(c: ConexionStrava | null, o: { t?: number; desdeNube?: boolean; soloAqui?: boolean } = {}) {
  const t = o.t ?? Date.now();
  try {
    localStorage.setItem(CLAVE_TOCADO, '1');
    if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
    else localStorage.removeItem(CLAVE);
    if (!o.soloAqui) localStorage.setItem(CLAVE_T, String(t));
  } catch {
    // sin almacenamiento: la conexión durará solo esta sesión
  }
  if (!o.desdeNube && !o.soloAqui && espejo) {
    espejo(c ? { refresh: c.refresh, atleta: c.atleta, atletaId: c.atletaId, t } : { desconectado: true, t });
  }
  window.dispatchEvent(new Event('strava-cambio'));
}

export function cambiarAutoSubida(auto: boolean) {
  const c = leerConexion();
  if (c) guardarConexion({ ...c, auto }, { soloAqui: true });
}

/** Dirección de esta web (a la que Strava devuelve al usuario tras dar permiso). */
const urlVuelta = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Lleva a la página de permisos de Strava (hay que llamarla desde un clic). */
export function conectarStrava() {
  const estado = Math.random().toString(36).slice(2);
  try {
    sessionStorage.setItem(CLAVE_ESTADO, estado);
  } catch {
    // sin almacenamiento de sesión: no se podrá comprobar el estado al volver
  }
  const p = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: urlVuelta(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:write',
    state: estado,
  });
  location.assign(`https://www.strava.com/oauth/authorize?${p}`);
}

async function llamar<T>(ruta: string, datos: unknown): Promise<T> {
  const r = await fetch(`${URL_INTERMEDIARIO.replace(/\/$/, '')}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

/**
 * Al cargar la web: si venimos de Strava con un código, se canjea y se guarda la conexión.
 * Devuelve un mensaje para mostrar (o null si no veníamos de Strava).
 */
export async function procesarVueltaDeStrava(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  const error = q.get('error');
  const estado = q.get('state');
  if (!code && !error) return null;
  // Quitar los parámetros de la dirección (que no se vuelvan a procesar al recargar)
  history.replaceState(null, '', urlVuelta());
  if (error) return 'No se conectó con Strava (permiso cancelado).';
  let esperado: string | null = null;
  try {
    esperado = sessionStorage.getItem(CLAVE_ESTADO);
    sessionStorage.removeItem(CLAVE_ESTADO);
  } catch {
    // sin almacenamiento de sesión
  }
  if (esperado && estado !== esperado) return 'No se pudo conectar con Strava: la respuesta no coincide. Inténtalo de nuevo.';
  if (!(q.get('scope') ?? '').includes('activity:write')) {
    return 'Para subir entrenamientos hay que dejar marcada la casilla de «subir actividades» en Strava. Vuelve a conectar.';
  }
  try {
    const r = await llamar<{ refresh: string; atleta: string; atletaId?: number | string }>('/token', { code });
    guardarConexion({ refresh: r.refresh, atleta: r.atleta, atletaId: r.atletaId, auto: true });
    return `Conectado con Strava como ${r.atleta}. Tus entrenamientos se subirán solos al terminar.`;
  } catch (e) {
    return `No se pudo conectar con Strava: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function desconectarStrava() {
  const c = leerConexion();
  guardarConexion(null);
  if (c) await llamar('/desconectar', { refresh: c.refresh }).catch(() => {});
}

export interface ResultadoSubida {
  /** Número de la actividad (texto si tiene más de 15 cifras). */
  actividad: number | string | null;
  duplicada: boolean;
  pendiente: boolean;
}

/** Sube un entrenamiento a Strava con la conexión guardada. */
export async function subirAStrava(e: Entreno, nombre: string, descripcion: string): Promise<ResultadoSubida> {
  const c = leerConexion();
  if (!c) throw new Error('No estás conectado con Strava');
  const geo = await prepararGeo(e).catch(() => null);
  const r = await llamar<ResultadoSubida & { refresh?: string }>('/subir', {
    refresh: c.refresh,
    // FIT (como Zwift o MyWhoosh): actividad virtual con la altitud del circuito y una vuelta por
    // intervalo. El TCX va de reserva por si el intermediario aún no sabe subir FIT.
    fit: fitBase64(generarFit(e, geo)),
    tcx: generarTcx(e, geo),
    nombre,
    descripcion,
    externo: `rodillos-${e.id}`,
  });
  // Strava puede cambiar el refresh token: se guarda el nuevo
  if (r.refresh && r.refresh !== c.refresh) guardarConexion({ ...c, refresh: r.refresh });
  return { actividad: r.actividad, duplicada: r.duplicada, pendiente: r.pendiente };
}

export const enlaceActividad = (id: number | string) => `https://www.strava.com/activities/${id}`;
