/**
 * Subida automática a Strava.
 *
 * - «Conectar con Strava» lleva a la página de permisos de Strava; al volver, la web recibe un
 *   código y el intermediario (servidor-strava/worker.js, en Cloudflare) lo canjea usando la
 *   clave secreta, que nunca está en la web.
 * - Cada ciclista guarda en su navegador su permiso (refresh token): no hay cuentas nuestras.
 * - Al terminar un entrenamiento se envía el TCX al intermediario, que lo sube a Strava.
 *
 * Mientras no se rellenen VITE_STRAVA_CLIENT_ID y VITE_STRAVA_INTERMEDIARIO (en el archivo
 * .env.production, que se sube al repositorio: ninguno de los dos es secreto) todo queda oculto.
 */
import { generarTcx, prepararGeo } from '../entrenamiento/tcx';
import type { Entreno } from '../entrenamiento/tipos';

/** Número de la aplicación creada en strava.com/settings/api (es público, no es secreto). */
export const STRAVA_CLIENT_ID: string = import.meta.env.VITE_STRAVA_CLIENT_ID ?? '';
/** Dirección del Worker de Cloudflare, p. ej. https://strava-rodillos.tunombre.workers.dev */
export const URL_INTERMEDIARIO: string = import.meta.env.VITE_STRAVA_INTERMEDIARIO ?? '';

const CLAVE = 'rodillos.strava';
const CLAVE_ESTADO = 'rodillos.strava.estado';

export interface ConexionStrava {
  refresh: string;
  atleta: string;
  atletaId?: number;
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

function guardarConexion(c: ConexionStrava | null) {
  try {
    if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
    else localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: la conexión durará solo esta sesión
  }
  window.dispatchEvent(new Event('strava-cambio'));
}

export function cambiarAutoSubida(auto: boolean) {
  const c = leerConexion();
  if (c) guardarConexion({ ...c, auto });
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
    const r = await llamar<{ refresh: string; atleta: string; atletaId?: number }>('/token', { code });
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
  actividad: number | null;
  duplicada: boolean;
  pendiente: boolean;
}

/** Sube un entrenamiento a Strava con la conexión guardada. */
export async function subirAStrava(e: Entreno, nombre: string, descripcion: string): Promise<ResultadoSubida> {
  const c = leerConexion();
  if (!c) throw new Error('No estás conectado con Strava');
  const r = await llamar<ResultadoSubida & { refresh?: string }>('/subir', {
    refresh: c.refresh,
    // Con mapa virtual y perfil del circuito (Strava solo enseña desnivel y gráfica si hay GPS)
    tcx: generarTcx(e, await prepararGeo(e).catch(() => null)),
    nombre,
    descripcion,
    externo: `rodillos-${e.id}`,
  });
  // Strava puede cambiar el refresh token: se guarda el nuevo
  if (r.refresh && r.refresh !== c.refresh) guardarConexion({ ...c, refresh: r.refresh });
  return { actividad: r.actividad, duplicada: r.duplicada, pendiente: r.pendiente };
}

export const enlaceActividad = (id: number) => `https://www.strava.com/activities/${id}`;
