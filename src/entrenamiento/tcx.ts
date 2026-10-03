/**
 * Genera un archivo TCX (Garmin Training Center) que Strava, Garmin Connect,
 * TrainingPeaks, etc. aceptan al subir una actividad a mano.
 * El orden de las etiquetas sigue el esquema oficial, que es estricto.
 */
import type { Entreno } from './tipos';

const iso = (ms: number) => new Date(ms).toISOString();
const entero = (n: number) => Math.round(n).toString();

/** Posición GPS virtual y altitud del circuito en el punto s (m desde la salida). */
export type Geo = (s: number, t?: number) => { lat: number; lon: number; alt: number };

/**
 * Mapa virtual para Strava (como hace Zwift con Watopia): los circuitos se sitúan en mitad del
 * Mediterráneo, al este de Menorca, donde no hay segmentos reales con los que se pueda cruzar.
 * Todos salen del mismo punto del mapa: si se cambia de circuito al cruzar la meta, el recorrido
 * sigue sin saltos. null si la sesión no guarda su recorrido.
 */
export async function prepararGeo(e: Entreno): Promise<Geo | null> {
  const id = e.resumen.circuito;
  if (!id || !e.muestras.some((m) => m.s !== undefined)) return null;
  const [{ circuitoPorId, longitudDe }, { trazadoDe }, { altitudEnCircuito }] = await Promise.all([
    import('../recorrido/circuitos'),
    import('../recorrido/trazado'),
    import('../recorrido/perfil'),
  ]);
  const paso = 5;
  const lat0 = 39.5;
  const lon0 = 5.0;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const trazados = new Map<string, ReturnType<typeof trazadoDe>>();
  const cambios = e.resumen.circuitos?.length ? e.resumen.circuitos : [[0, id] as [number, string]];
  // Circuito en el que se iba a la hora t
  const circuitoEn = (t: number) => {
    let actual = cambios[0][1];
    for (const [desde, c] of cambios) if (t >= desde) actual = c;
    return circuitoPorId(actual);
  };
  return (sAbs: number, t?: number) => {
    const c = circuitoEn(t ?? Infinity);
    let tr = trazados.get(c.id);
    if (!tr) {
      tr = trazadoDe(c, paso);
      trazados.set(c.id, tr);
    }
    const largo = longitudDe(c);
    const x = (((sAbs % largo) + largo) % largo) / paso;
    const i = Math.floor(x) % tr.n;
    const j = (i + 1) % tr.n;
    const f = x - Math.floor(x);
    const px = tr.x[i] + (tr.x[j] - tr.x[i]) * f - tr.x[0];
    const pz = tr.z[i] + (tr.z[j] - tr.z[i]) * f - tr.z[0];
    return { lat: lat0 - pz / mLat, lon: lon0 + px / mLon, alt: altitudEnCircuito(c, sAbs) };
  };
}

/** `geo`: si se pasa, cada punto lleva su posición en el mapa virtual y la altitud del circuito. */
export function generarTcx(e: Entreno, geo: Geo | null = null): string {
  const r = e.resumen;
  const conAltitud = e.muestras.some((m) => m.alt !== 0);

  const puntos = e.muestras
    .map((m) => {
      let s = `<Trackpoint><Time>${iso(m.t)}</Time>`;
      const g = geo && m.s !== undefined ? geo(m.s, m.t) : null;
      if (g) {
        s += `<Position><LatitudeDegrees>${g.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${g.lon.toFixed(7)}</LongitudeDegrees></Position>`;
        s += `<AltitudeMeters>${g.alt.toFixed(1)}</AltitudeMeters>`;
      } else if (conAltitud) s += `<AltitudeMeters>${m.alt.toFixed(1)}</AltitudeMeters>`;
      s += `<DistanceMeters>${m.d.toFixed(1)}</DistanceMeters>`;
      if (m.hr) s += `<HeartRateBpm><Value>${entero(m.hr)}</Value></HeartRateBpm>`;
      if (m.c !== undefined) s += `<Cadence>${Math.min(254, Math.round(m.c))}</Cadence>`;
      if (m.v !== undefined || m.p !== undefined) {
        s += '<Extensions><ns3:TPX>';
        if (m.v !== undefined) s += `<ns3:Speed>${(m.v / 3.6).toFixed(3)}</ns3:Speed>`;
        if (m.p !== undefined) s += `<ns3:Watts>${entero(Math.max(0, m.p))}</ns3:Watts>`;
        s += '</ns3:TPX></Extensions>';
      }
      return s + '</Trackpoint>';
    })
    .join('\n');

  let vuelta = `<TotalTimeSeconds>${r.duracionS}</TotalTimeSeconds>`;
  vuelta += `<DistanceMeters>${r.distanciaM.toFixed(1)}</DistanceMeters>`;
  if (r.velocidadMax !== undefined) vuelta += `<MaximumSpeed>${(r.velocidadMax / 3.6).toFixed(3)}</MaximumSpeed>`;
  // En ciclismo, kJ de trabajo ≈ kcal gastadas (la eficiencia del cuerpo compensa la conversión)
  vuelta += `<Calories>${entero(r.kilojulios)}</Calories>`;
  if (r.pulsoMedio) vuelta += `<AverageHeartRateBpm><Value>${entero(r.pulsoMedio)}</Value></AverageHeartRateBpm>`;
  if (r.pulsoMax) vuelta += `<MaximumHeartRateBpm><Value>${entero(r.pulsoMax)}</Value></MaximumHeartRateBpm>`;
  vuelta += '<Intensity>Active</Intensity>';
  if (r.cadenciaMedia) vuelta += `<Cadence>${Math.min(254, Math.round(r.cadenciaMedia))}</Cadence>`;
  vuelta += '<TriggerMethod>Manual</TriggerMethod>';

  const notas = `Entrenamiento en rodillo${r.potenciaEstimada ? ' (potencia estimada)' : ''} · RideCrew`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Activities>
<Activity Sport="Biking">
<Id>${iso(e.inicio)}</Id>
<Lap StartTime="${iso(e.inicio)}">${vuelta}
<Track>
${puntos}
</Track>
${r.potenciaMedia !== undefined ? `<Extensions><ns3:LX><ns3:AvgWatts>${entero(r.potenciaMedia)}</ns3:AvgWatts></ns3:LX></Extensions>` : ''}
</Lap>
<Notes>${notas}</Notes>
<Creator xsi:type="Device_t"><Name>RideCrew with barometer</Name><UnitId>0</UnitId><ProductID>0</ProductID><Version><VersionMajor>1</VersionMajor><VersionMinor>0</VersionMinor></Version></Creator>
</Activity>
</Activities>
</TrainingCenterDatabase>
`;
}

/** Nombre de archivo tipo "rodillo-2026-09-25-1830.tcx" (hora local). */
export function nombreArchivo(inicio: number) {
  const d = new Date(inicio);
  const dd = (n: number) => n.toString().padStart(2, '0');
  return `rodillo-${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}-${dd(d.getHours())}${dd(d.getMinutes())}.tcx`;
}

/** Descarga el TCX. Si el navegador no puede descargar (algunas apps de iOS), ofrece compartirlo. */
export async function descargarTcx(e: Entreno) {
  const nombre = nombreArchivo(e.inicio);
  const blob = new Blob([generarTcx(e, await prepararGeo(e).catch(() => null))], { type: 'application/vnd.garmin.tcx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** true si el navegador permite compartir archivos (hoja de compartir de iOS/Android). */
export function puedeCompartir() {
  try {
    const prueba = new File(['x'], 'a.tcx', { type: 'application/xml' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [prueba] });
  } catch {
    return false;
  }
}

/** Abre la hoja de compartir con el TCX (útil en iPad/iPhone para guardarlo en Archivos o enviarlo). */
export async function compartirTcx(e: Entreno) {
  const archivo = new File([generarTcx(e, await prepararGeo(e).catch(() => null))], nombreArchivo(e.inicio), {
    type: 'application/xml',
  });
  await navigator.share({ files: [archivo], title: 'Entrenamiento en rodillo' });
}
