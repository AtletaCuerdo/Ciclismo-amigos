/**
 * Intermediario con Strava (Cloudflare Worker, plan gratuito).
 *
 * Guarda la clave secreta de la aplicación de Strava, que no puede ir en la web porque
 * cualquiera podría verla, y hace tres cosas:
 *   POST /token   { code }                        → canjea el código de autorización
 *   POST /subir   { refresh, tcx, nombre, descripcion, externo } → sube el TCX y devuelve la actividad
 *   POST /desconectar { refresh }                 → revoca el permiso en Strava
 *
 * No guarda nada: cada ciclista conserva su propio «refresh token» en su navegador.
 *
 * Variables del Worker (Settings → Variables and Secrets):
 *   STRAVA_CLIENT_ID      número de la aplicación de Strava
 *   STRAVA_CLIENT_SECRET  clave secreta (como «Secret»)
 *   ORIGENES              webs que pueden usarlo, separadas por comas
 *                         p. ej. https://atletacuerdo.github.io,http://localhost:5173
 */

const API = 'https://www.strava.com';

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

async function subir(env, { refresh, tcx, nombre, descripcion, externo }) {
  if (!refresh || !tcx) throw new Error('Faltan datos para subir');
  // Cada subida pide un token nuevo (dura 6 h); Strava puede cambiar también el refresh token
  const t = await pedirToken(env, { refresh_token: refresh, grant_type: 'refresh_token' });
  const acceso = t.access_token;

  const form = new FormData();
  form.append('file', new Blob([tcx], { type: 'application/xml' }), 'entrenamiento.tcx');
  form.append('data_type', 'tcx');
  form.append('trainer', '1');
  if (nombre) form.append('name', String(nombre).slice(0, 200));
  if (descripcion) form.append('description', String(descripcion).slice(0, 2000));
  if (externo) form.append('external_id', String(externo).slice(0, 100));
  const r = await fetch(`${API}/api/v3/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${acceso}` }, body: form });
  let estado = await r.json();
  if (!r.ok) throw new Error(`Strava no aceptó el archivo (${r.status}): ${estado.message ?? JSON.stringify(estado)}`);

  // Strava procesa el archivo en unos segundos: se consulta hasta tener la actividad
  for (let i = 0; i < 8 && !estado.activity_id && !estado.error; i++) {
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

  // Que aparezca como «Virtual Ride» (rodillo con recorrido virtual)
  if (actividad && !duplicada) {
    await fetch(`${API}/api/v3/activities/${actividad}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sport_type: 'VirtualRide', trainer: true }),
    }).catch(() => {});
  }

  return {
    actividad,
    duplicada,
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
