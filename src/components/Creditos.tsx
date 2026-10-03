/**
 * Créditos de los recursos 3D y del software usado (en Ajustes).
 * Los recursos CC0 no obligan a citar al autor, pero se agradece; si algún día se usa
 * uno CC-BY, citarlo aquí es obligatorio.
 */
interface Recurso {
  que: string;
  autor: string;
  licencia: string;
  enlace: string;
}

const RECURSOS: Recurso[] = [
  {
    que: 'Ciclista: cuerpos, peinados, barba y cejas (Universal Base Characters)',
    autor: 'Quaternius',
    licencia: 'CC0',
    enlace: 'https://quaternius.itch.io/universal-base-characters',
  },
  {
    que: 'Árboles, arbustos, hierba, flores y setas (Stylized Nature MegaKit)',
    autor: 'Quaternius',
    licencia: 'CC0',
    enlace: 'https://opengameart.org/content/stylized-nature-megakit',
  },
  {
    que: 'Rocas, tocones, troncos, helechos, arbustos y hierbas silvestres (modelos escaneados)',
    autor: 'Poly Haven',
    licencia: 'CC0',
    enlace: 'https://polyhaven.com/models',
  },
  {
    que: 'Asfalto, hierba y grava (texturas)',
    autor: 'Poly Haven',
    licencia: 'CC0',
    enlace: 'https://polyhaven.com/textures',
  },
  {
    que: 'Cielo «Kloofendal 48d Partly Cloudy (Pure Sky)»',
    autor: 'Poly Haven',
    licencia: 'CC0',
    enlace: 'https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky',
  },
  {
    que: 'Cielos de mañana, tarde y atardecer: «Citrus Orchard Road», «Evening Road 01» y «Belfast Sunset» (Pure Sky)',
    autor: 'Poly Haven',
    licencia: 'CC0',
    enlace: 'https://polyhaven.com/hdris/skies',
  },
];

const SOFTWARE = [
  { que: 'three.js (gráficos 3D)', licencia: 'MIT', enlace: 'https://threejs.org' },
  { que: 'React', licencia: 'MIT', enlace: 'https://react.dev' },
  { que: 'Firebase (salida en grupo)', licencia: 'Apache 2.0', enlace: 'https://firebase.google.com' },
];

export function Creditos() {
  return (
    <section className="panel creditos">
      <h2>Créditos</h2>
      <p className="detalle">
        Los modelos y texturas son de dominio público (CC0): se pueden usar libremente. Aun así, gracias a sus
        autores. El casco, las gafas, la bici, la equipación, el terreno y las montañas se generan por código.
      </p>
      <ul>
        {RECURSOS.map((r) => (
          <li key={r.que}>
            <strong>{r.que}</strong> — {r.autor} · {r.licencia} ·{' '}
            <a href={r.enlace} target="_blank" rel="noreferrer">
              ver
            </a>
          </li>
        ))}
      </ul>
      <h3>Software</h3>
      <ul>
        {SOFTWARE.map((s) => (
          <li key={s.que}>
            {s.que} · {s.licencia} ·{' '}
            <a href={s.enlace} target="_blank" rel="noreferrer">
              ver
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
