/**
 * Ajustes → «Tu FTP y peso»: el FTP manda en la intensidad de todos los entrenamientos
 * (están en % del FTP) y aquí se ven tus zonas en vatios. El peso se usa para la velocidad
 * en el recorrido. Se guarda en el perfil (y en la cuenta, si el usuario ha entrado).
 */
import { useState } from 'react';
import type { Perfil } from '../recorrido/avatar';
import { colorZona } from './GraficaEntrenamiento';

const ZONAS: { nombre: string; desde: number; hasta?: number }[] = [
  { nombre: 'Z1 Recuperación', desde: 0, hasta: 55 },
  { nombre: 'Z2 Resistencia', desde: 56, hasta: 75 },
  { nombre: 'Z3 Tempo', desde: 76, hasta: 90 },
  { nombre: 'Z4 Umbral', desde: 91, hasta: 105 },
  { nombre: 'Z5 VO2Max', desde: 106, hasta: 120 },
  { nombre: 'Z6 Anaeróbico', desde: 121 },
];

export function PanelFtp({ perfil, onCambiar }: { perfil: Perfil; onCambiar: (p: Perfil) => void }) {
  const [ftp, setFtp] = useState(String(perfil.ftp));
  const [peso, setPeso] = useState(String(perfil.pesoKg));
  const w = (pct: number) => Math.round((pct * perfil.ftp) / 100);

  return (
    <section className="panel panel-ftp">
      <h2>Tu FTP y peso</h2>
      <p className="detalle">
        Si ya conoces tu FTP, escríbelo aquí: todos los entrenamientos se adaptan solos (sus potencias van en % del FTP).
        Si no lo sabes, haz uno de los tests de la categoría «Test» y la web te propondrá el valor al terminar.
      </p>
      <div className="campos-ftp">
        <label className="campo-ftp">
          <span>FTP</span>
          <input
            type="text"
            inputMode="numeric"
            value={ftp}
            onChange={(e) => {
              setFtp(e.target.value);
              const v = Number(e.target.value);
              if (v >= 50 && v <= 600) onCambiar({ ...perfil, ftp: Math.round(v) });
            }}
            onBlur={() => setFtp(String(perfil.ftp))}
          />
          <span>W</span>
        </label>
        <label className="campo-ftp">
          <span>Peso</span>
          <input
            type="text"
            inputMode="decimal"
            value={peso}
            onChange={(e) => {
              setPeso(e.target.value);
              const v = Number(e.target.value.replace(',', '.'));
              if (v >= 30 && v <= 200) onCambiar({ ...perfil, pesoKg: Math.round(v * 10) / 10 });
            }}
            onBlur={() => setPeso(String(perfil.pesoKg))}
          />
          <span>kg</span>
        </label>
        <div className="wkg">
          <strong>{(perfil.ftp / perfil.pesoKg).toFixed(2).replace('.', ',')}</strong>
          <span>W/kg</span>
        </div>
      </div>
      <table className="tabla-zonas">
        <tbody>
          {ZONAS.map((z, i) => {
            // Cada zona empieza 1 W después de donde acaba la anterior: sin huecos al redondear
            const desdeW = i === 0 ? 0 : w(ZONAS[i - 1].hasta ?? 0) + 1;
            return (
              <tr key={z.nombre}>
                <td>
                  <span className="muestra-zona" style={{ background: colorZona(z.hasta ?? z.desde + 1) }} />
                  {z.nombre}
                </td>
                <td>{z.hasta !== undefined ? `${z.desde}-${z.hasta} %` : `> ${z.desde - 1} %`}</td>
                <td>
                  <strong>{z.hasta !== undefined ? `${desdeW}-${w(z.hasta)} W` : `> ${desdeW - 1} W`}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="detalle">Si has entrado con tu cuenta, se guarda en tu perfil y lo verás en todos tus dispositivos.</p>
    </section>
  );
}
