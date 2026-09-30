/**
 * Segmentos durante el recorrido: aviso de la meta volante que se acerca (con los metros que
 * faltan), crono en directo del tramo en marcha y, al terminarlo, el tiempo con tu récord y la
 * tabla del grupo.
 */
import { useEffect, useState } from 'react';
import type { ResultadoSegmento } from '../App';
import { LONGITUD_VUELTA_M, enVuelta } from '../recorrido/perfil';
import { segmentos, textoTiempo, type TramoActivo } from '../recorrido/segmentos';

/** Desde cuántos metros antes se avisa de la meta volante. */
const AVISO_META_M = 1000;

interface Props {
  /** Punto del circuito donde voy (m, contando vueltas). */
  distancia: number;
  activos: TramoActivo[];
  resultado: ResultadoSegmento | null;
  onCerrarResultado: () => void;
  enGrupo: boolean;
  miRecord: (segmento: string) => number | undefined;
}

const ICONO = { subida: '⛰️', meta: '🏁', vuelta: '🔁' } as const;

export function PanelSegmentos({ distancia, activos, resultado, onCerrarResultado, enGrupo, miRecord }: Props) {
  // Los cronos en marcha se repintan cada décima
  const [, repintar] = useState(0);
  const hayCrono = activos.some((t) => t.segmento.tipo !== 'vuelta');
  useEffect(() => {
    if (!hayCrono) return;
    const id = setInterval(() => repintar((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [hayCrono]);

  // Meta volante que se acerca (solo en grupo y si no la estoy haciendo ya)
  const x = enVuelta(distancia);
  let aviso: { nombre: string; faltan: number } | null = null;
  if (enGrupo) {
    for (const s of segmentos()) {
      if (s.tipo !== 'meta' || activos.some((t) => t.segmento.id === s.id)) continue;
      const faltan = s.inicio >= x ? s.inicio - x : s.inicio + LONGITUD_VUELTA_M - x;
      if (faltan <= AVISO_META_M && (!aviso || faltan < aviso.faltan)) aviso = { nombre: s.nombre, faltan };
    }
  }

  const cronos = activos.filter((t) => t.segmento.tipo !== 'vuelta');
  if (!aviso && !cronos.length && !resultado) return null;
  const ahora = performance.now();

  return (
    <div className="hud-segmentos">
      {aviso && (
        <div className="hud segmento-aviso">
          🏁 <strong>Meta volante</strong> en <strong className="segmento-metros">{Math.max(0, Math.round(aviso.faltan / 10) * 10)} m</strong>
        </div>
      )}
      {cronos.map((t) => {
        const record = miRecord(t.segmento.id);
        const meta = t.segmento.tipo === 'meta';
        const recorrido = enVuelta(distancia) - t.segmento.inicio;
        const queda = Math.max(0, t.segmento.fin - t.segmento.inicio - (recorrido >= 0 ? recorrido : recorrido + LONGITUD_VUELTA_M));
        return (
          <div key={t.segmento.id} className={`hud segmento-crono ${meta ? 'meta' : ''}`}>
            <span className="segmento-nombre">
              {ICONO[t.segmento.tipo]} {t.segmento.nombre}
            </span>
            <span className="segmento-tiempo">{textoTiempo(ahora - t.desdeT, meta)}</span>
            <span className="segmento-detalle">
              quedan {queda >= 1000 ? `${(queda / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(queda)} m`}
              {record !== undefined && ` · récord ${textoTiempo(record, meta)}`}
            </span>
          </div>
        );
      })}
      {resultado && <Resultado r={resultado} onCerrar={onCerrarResultado} />}
    </div>
  );
}

function Resultado({ r, onCerrar }: { r: ResultadoSegmento; onCerrar: () => void }) {
  const decimas = r.segmento.tipo === 'meta';
  const diferencia = r.anterior !== undefined ? r.ms - r.anterior : null;
  return (
    <div className={`hud segmento-resultado ${r.esRecord ? 'record' : ''}`} role="status">
      <button className="segmento-cerrar" onClick={onCerrar} aria-label="Cerrar">
        ✕
      </button>
      <span className="segmento-nombre">
        {ICONO[r.segmento.tipo]} {r.segmento.nombre}
      </span>
      <span className="segmento-tiempo">{textoTiempo(r.ms, decimas)}</span>
      <span className="segmento-detalle">
        {r.anterior === undefined
          ? '¡Primera vez! Ya tienes marca'
          : r.esRecord
            ? `🎉 ¡Nuevo récord! ${textoTiempo(Math.abs(diferencia!), decimas)} mejor`
            : `Tu récord: ${textoTiempo(r.anterior, decimas)} (+${textoTiempo(diferencia!, decimas)})`}
      </span>
      {r.tabla && r.tabla.length > 0 && (
        <ol className="segmento-tabla">
          {r.tabla.slice(0, 5).map((m, i) => (
            <li key={m.uid} className={m.uid === r.miUid ? 'yo' : undefined}>
              <span>{i === 0 ? '👑' : `${i + 1}.`}</span>
              <span className="segmento-tabla-nombre">{m.uid === r.miUid ? 'Tú' : m.nombre}</span>
              <span>{textoTiempo(m.ms, decimas)}</span>
            </li>
          ))}
        </ol>
      )}
      {r.sinReglas && <span className="segmento-aviso-reglas">La tabla del grupo necesita las reglas nuevas de Firebase.</span>}
    </div>
  );
}
