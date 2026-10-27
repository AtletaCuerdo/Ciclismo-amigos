/**
 * Intermediario con Strava (Cloudflare Worker, plan gratuito).
 *
 * Guarda la clave secreta de la aplicación de Strava, que no puede ir en la web porque
 * cualquiera podría verla, y hace tres cosas:
 *   POST /token   { code }                        → canjea el código de autorización
 *   POST /subir   { refresh, fit | tcx, nombre, descripcion, externo } → sube el archivo y devuelve la actividad
 *   POST /desconectar { refresh }                 → revoca el permiso en Strava
 *   POST /alta    { idToken }                     → avisa por correo al administrador de una cuenta
 *                                                   nueva de RideCrew (ver «Aviso de altas» abajo)
 *
 * No guarda nada: cada ciclista conserva su propio «refresh token» en su navegador.
 *
 * Variables del Worker (Settings → Variables and Secrets):
 *   STRAVA_CLIENT_ID      número de la aplicación de Strava
 *   STRAVA_CLIENT_SECRET  clave secreta (como «Secret»)
 *   ORIGENES              webs que pueden usarlo, separadas por comas
 *                         p. ej. https://atletacuerdo.github.io,http://localhost:5173
 *
 * Aviso de altas (opcional): Email Routing activado en el dominio y, en el Worker,
 *   CORREO                enlace «Send email» (Settings → Bindings) con la dirección de destino
 *   AVISO_DESTINO         a quién se avisa (la dirección verificada en Email Routing)
 *   AVISO_REMITENTE       desde qué dirección del dominio, p. ej. ridecrew@tricoach.es
 */

import { EmailMessage } from 'cloudflare:email';

const API = 'https://www.strava.com';
/** Configuración web de Firebase (no es secreta: va dentro de la web). */
const FIREBASE_API_KEY = 'AIzaSyCIySBMX4amJBnd_pfEzge7psFnqkbGWSE';
/** Solo se avisa de cuentas creadas hace menos de esto (así nadie puede repetir avisos viejos). */
const ALTA_RECIENTE_MS = 30 * 60 * 1000;

export default {
  async fetch(peticion, env) {
    const origen = peticion.headers.get('Origin') ?? '';
    const permitidos = (env.ORIGENES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const cabeceras = {
      'Access-Control-Allow-Origin': permitidos.includes(origen) ? origen : permitidos[0] ?? '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const responder = (datos, estado = 200) =>
      new Response(JSON.stringify(datos), { status: estado, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabeceras });
    if (!permitidos.includes(origen)) return responder({ error: 'Origen no permitido' }, 403);
    if (peticion.method !== 'POST') return responder({ error: 'Solo POST' }, 405);
    if (new URL(peticion.url).pathname === '/alta') {
      try {
        return responder(await avisarAlta(env, (await peticion.json()).idToken));
      } catch (e) {
        return responder({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      return responder({ error: 'Faltan STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET en el Worker' }, 500);
    }

    let cuerpo;
    try {
      cuerpo = await peticion.json();
    } catch {
      return responder({ error: 'Cuerpo JSON no válido' }, 400);
    }
    const ruta = new URL(peticion.url).pathname;

    try {
      if (ruta === '/token') return responder(await canjearCodigo(env, cuerpo.code));
      if (ruta === '/subir') return responder(await subir(env, cuerpo));
      if (ruta === '/desconectar') return responder(await desconectar(env, cuerpo.refresh));
      return responder({ error: 'Ruta desconocida' }, 404);
    } catch (e) {
      return responder({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  },
};

/** Pide un token a Strava (con el código de autorización o con el refresh token). */
async function pedirToken(env, datos) {
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...datos }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Strava rechazó el permiso (${r.status}): ${j.message ?? JSON.stringify(j)}`);
  return j;
}

async function canjearCodigo(env, code) {
  if (!code) throw new Error('Falta el código de autorización');
  const t = await pedirToken(env, { code, grant_type: 'authorization_code' });
  const a = t.athlete ?? {};
  return {
    refresh: t.refresh_token,
    atleta: [a.firstname, a.lastname].filter(Boolean).join(' ') || 'tu cuenta',
    atletaId: a.id,
  };
}

async function subir(env, { refresh, fit, tcx, nombre, descripcion, externo }) {
  if (!refresh || (!fit && !tcx)) throw new Error('Faltan datos para subir');
  // Cada subida pide un token nuevo (dura 6 h); Strava puede cambiar también el refresh token
  const t = await pedirToken(env, { refresh_token: refresh, grant_type: 'refresh_token' });
  const acceso = t.access_token;

  const form = new FormData();
  if (fit) {
    // FIT (como Zwift o MyWhoosh): Strava lo crea como «Virtual Ride», con la altitud del archivo
    // y una vuelta por intervalo (para el «Análisis del entrenamiento»)
    const bytes = Uint8Array.from(atob(fit), (c) => c.charCodeAt(0));
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'entrenamiento.fit');
    form.append('data_type', 'fit');
  } else {
    form.append('file', new Blob([tcx], { type: 'application/xml' }), 'entrenamiento.tcx');
    form.append('data_type', 'tcx');
  }
  // Sin «trainer»: Strava quita el mapa y el desnivel a las actividades de rodillo. Se sube como
  // actividad normal y luego se cambia a «Virtual Ride» (como Zwift o MyWhoosh), que sí los enseña.
  if (nombre) form.append('name', String(nombre).slice(0, 200));
  if (descripcion) form.append('description', String(descripcion).slice(0, 2000));
  if (externo) form.append('external_id', String(externo).slice(0, 100));
  const r = await fetch(`${API}/api/v3/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${acceso}` }, body: form });
  let estado = await r.json();
  if (!r.ok) throw new Error(`Strava no aceptó el archivo (${r.status}): ${estado.message ?? JSON.stringify(estado)}`);

  // Strava procesa el archivo en unos segundos: se consulta hasta tener la actividad
  // (las sesiones largas tardan más: hasta ~30 s)
  for (let i = 0; i < 20 && !estado.activity_id && !estado.error; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    const c = await fetch(`${API}/api/v3/uploads/${estado.id}`, { headers: { Authorization: `Bearer ${acceso}` } });
    estado = await c.json();
  }

  let actividad = estado.activity_id ?? null;
  // Duplicada: Strava ya la tenía (p. ej. se subió a mano). Se devuelve su número si lo indica.
  const duplicada = typeof estado.error === 'string' && /duplicate/i.test(estado.error);
  if (duplicada && !actividad) {
    const m = /activities\/(\d+)/.exec(estado.error);
    if (m) actividad = Number(m[1]);
  }
  if (estado.error && !duplicada) throw new Error(`Strava: ${estado.error}`);

  // Que aparezca como «Virtual Ride» (rodillo con recorrido virtual). Strava a veces tarda en dejar
  // editar una actividad recién creada: se reintenta unas cuantas veces.
  let tipo = null;
  if (actividad && !duplicada) {
    for (let i = 0; i < 5 && tipo !== 'VirtualRide'; i++) {
      if (i > 0) await new Promise((res) => setTimeout(res, 2000));
      try {
        const c = await fetch(`${API}/api/v3/activities/${actividad}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sport_type: 'VirtualRide', trainer: false }),
        });
        if (c.ok) tipo = (await c.json()).sport_type ?? null;
      } catch {
        // se reintenta
      }
    }
  }

  return {
    actividad,
    duplicada,
    tipo,
    pendiente: !actividad && !duplicada,
    refresh: t.refresh_token,
  };
}

async function desconectar(env, refresh) {
  if (!refresh) return { ok: true };
  const t = await pedirToken(env, { refresh_token: refresh, grant_type: 'refresh_token' });
  await fetch(`${API}/oauth/deauthorize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Aviso de altas por correo
// ---------------------------------------------------------------------------

/**
 * Comprueba con Google que el token es de una cuenta de verdad de RideCrew (si es falso, Google lo
 * rechaza) y, si la cuenta es nueva, manda un correo al administrador con sus datos. Cada cuenta
 * se avisa una sola vez (se recuerda en la caché del Worker).
 */
async function avisarAlta(env, idToken) {
  if (!env.CORREO || !env.AVISO_DESTINO || !env.AVISO_REMITENTE) return { avisado: false, motivo: 'aviso sin configurar' };
  if (typeof idToken !== 'string' || idToken.length > 5000) throw new Error('Falta el token');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) throw new Error('Token no válido');
  const u = (await r.json()).users?.[0];
  if (!u) throw new Error('Cuenta no encontrada');
  const alta = Number(u.createdAt);
  if (!(Date.now() - alta < ALTA_RECIENTE_MS)) return { avisado: false, motivo: 'la cuenta no es nueva' };

  // Una sola vez por cuenta (la web también lo recuerda; en workers.dev esta caché no guarda nada)
  const cache = caches.default;
  const clave = new Request(`https://avisos.ridecrew/alta/${u.localId}`);
  if (await cache.match(clave)) return { avisado: false, motivo: 'ya avisado' };

  const proveedor = (u.providerUserInfo ?? []).map((p) => (p.providerId === 'google.com' ? 'Google' : 'correo y contraseña')).join(', ') || 'correo y contraseña';
  const fecha = new Date(alta).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });
  const texto = [
    'Nueva cuenta en RideCrew',
    '',
    `Nombre: ${u.displayName || '(sin nombre)'}`,
    `Correo: ${u.email || '(sin correo)'}`,
    `Correo verificado: ${u.emailVerified ? 'sí' : 'no'}`,
    `Se ha registrado con: ${proveedor}`,
    `Fecha de alta: ${fecha}`,
    `Identificador: ${u.localId}`,
    '',
    'Lo verás también en el panel de administración (🛡️) de RideCrew.',
  ].join('\r\n');
  const asunto = `RideCrew: nueva cuenta de ${u.displayName || u.email || 'un ciclista'}`;
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const crudo = [
    `From: RideCrew <${env.AVISO_REMITENTE}>`,
    `To: ${env.AVISO_DESTINO}`,
    `Subject: =?UTF-8?B?${b64(asunto)}?=`,
    `Message-ID: <alta-${u.localId}-${Date.now()}@${env.AVISO_REMITENTE.split('@')[1]}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(texto).replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  await env.CORREO.send(new EmailMessage(env.AVISO_REMITENTE, env.AVISO_DESTINO, crudo));
  await cache.put(clave, new Response('1', { headers: { 'Cache-Control': 'max-age=86400' } }));
  return { avisado: true };
}
