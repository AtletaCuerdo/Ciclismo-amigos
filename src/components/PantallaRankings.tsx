/**
 * 🏆 Rankings del grupo: totales de siempre (km, horas, desnivel, sesiones y tiempo a rueda)
 * y el récord de cada segmento del circuito.
 */
import { useEffect, useState } from 'react';
import { leerRankings, type FilaRanking } from '../multijugador/rankings';
import { tablaGrupo, type MarcaGrupo } from '../recorrido/records';
import { SEGMENTOS, textoTiempo } from '../recorrido/segmentos';

type Clave = 'metros' | 'segundos' | 'desnivel' | 'sesiones' | 'rueda';

const PESTANAS: { clave: Clave; nombre: string; valor: (f: FilaRanking) => string }[] = [
  { clave: 'metros', nombre: 'Kilómetros', valor: (f) => `${Math.round(f.metros / 1000).toLocaleString('es-ES')} km` },
  { clave: 'segundos', nombre: 'Horas', valor: (f) => `${(f.segundos / 3600).toFixed(1).replace('.', ',')} h` },
  { clave: 'desnivel', nombre: 'Desnivel', valor: (f) => `${Math.round(f.desnivel).toLocaleString('es-ES')} m` },
  { clave: 'sesiones', nombre: 'Sesiones', valor: (f) => `${f.sesiones}` },
  { clave: 'rueda', nombre: 'Chupa ruedas 🧛', valor: (f) => textoTiempo(f.rueda * 1000) },
];

const MEDALLAS = ['🥇', '🥈', '🥉'];

export function PantallaRankings({ onVolver }: { onVolver: () => void }) {
  const [pestana, setPestana] = useState<Clave>('metros');
  const [datos, setDatos] = useState<{ filas: FilaRanking[]; miUid: string } | null>(null);
  const [records, setRecords] = useState<{ id: string; nombre: string; tabla: MarcaGrupo[]; miUid: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerRankings()
      .then(setDatos)
      .catch(() => setError('No se pudieron leer los rankings. Comprueba la conexión (o que las reglas de Firebase estén al día).'));
    Promise.all(
      SEGMENTOS.map((s) =>
        tablaGrupo(s.id)
          .then(({ tabla, miUid }) => ({ id: s.id, nombre: s.nombre, tabla, miUid }))
          .catch(() => ({ id: s.id, nombre: s.nombre, tabla: [] as MarcaGrupo[], miUid: '' })),
      ),
    ).then(setRecords);
  }, []);

  const actual = PESTANAS.find((p) => p.clave === pestana)!;
  const filas = [...(datos?.filas ?? [])].filter((f) => f[pestana] > 0).sort((a, b) => b[pestana] - a[pestana]);

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>🏆 Rankings del grupo</h2>
      </div>
      <p className="detalle">Totales de siempre de cada uno. Se actualizan al terminar cada sesión.</p>

      <div className="pestanas-ranking" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            role="tab"
            aria-selected={p.clave === pestana}
            className={p.clave === pestana ? 'activa' : undefined}
            onClick={() => setPestana(p.clave)}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {error && <p className="aviso">{error}</p>}
      {!datos && !error && <p className="detalle">Cargando…</p>}
      {datos && filas.length === 0 && <p className="vacio">Aún no hay datos. ¡Sal a rodar!</p>}
      <ol className="lista-ranking">
        {filas.map((f, i) => (
          <li key={f.uid} className={f.uid === datos?.miUid ? 'yo' : undefined}>
            <span className="ranking-puesto">{MEDALLAS[i] ?? `${i + 1}.`}</span>
            <span className="ranking-nombre">
              {f.nombre}
              {f.uid === datos?.miUid && ' (tú)'}
            </span>
            <span className="ranking-valor">{actual.valor(f)}</span>
          </li>
        ))}
      </ol>

      <h3 className="titulo-records">⛰️ Récords de los segmentos</h3>
      <div className="rejilla-records">
        {records.map((r) => {
          const segmento = SEGMENTOS.find((s) => s.id === r.id)!;
          const decimas = segmento.tipo === 'meta';
          const lider = r.tabla[0];
          const mio = r.tabla.find((m) => m.uid === r.miUid);
          const puesto = mio ? r.tabla.indexOf(mio) + 1 : null;
          return (
            <div key={r.id} className="tarjeta-record">
              <strong>{r.nombre}</strong>
              {lider ? (
                <span>
                  👑 {lider.uid === r.miUid ? 'Tú' : lider.nombre} · <b>{textoTiempo(lider.ms, decimas)}</b>
                </span>
              ) : (
                <span className="detalle">Sin tiempos todavía</span>
              )}
              {mio && lider && mio !== lider && (
                <span className="detalle">
                  Tú: {textoTiempo(mio.ms, decimas)} ({puesto}.º, +{textoTiempo(mio.ms - lider.ms, decimas)})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
