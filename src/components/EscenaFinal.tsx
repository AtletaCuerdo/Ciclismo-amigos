/**
 * Escenas para el final de la sesión («Finalizar y ver estadísticas»): el resumen sale encima.
 * Estilo de ilustración cinematográfica (siluetas a contraluz, luz cálida, movimientos lentos),
 * hecha en SVG con animaciones CSS: carga al momento y no gasta memoria de la GPU, que en el iPad
 * acaba de quedar libre al cerrar la escena 3D.
 */
import type { ReactNode } from 'react';

export type EscenaFinal = 'cervezas' | 'cama' | 'fisio';

export const ESCENAS: { id: EscenaFinal; emoji: string; nombre: string }[] = [
  { id: 'cervezas', emoji: '🍺', nombre: 'Cervezas con los colegas' },
  { id: 'cama', emoji: '🛏️', nombre: 'A la cama mirando Strava' },
  { id: 'fisio', emoji: '💆', nombre: 'Al fisio' },
];

interface Colores {
  maillot: string;
  piel: string;
  pelo: string;
}

const SOMBRA = '#0a0f1a';

/** Degradado lineal reutilizable. */
function Lineal({ id, de, a, x2 = 0, y2 = 1 }: { id: string; de: string; a: string; x2?: number; y2?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" stopColor={de} />
      <stop offset="1" stopColor={a} />
    </linearGradient>
  );
}

/** Halo de luz (centro brillante que se apaga hacia fuera). */
function Halo({ id, color }: { id: string; color: string }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity={0.9} />
      <stop offset="0.35" stopColor={color} stopOpacity={0.35} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </radialGradient>
  );
}

function Vineta() {
  return (
    <>
      <radialGradient id="ef-vineta" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.55" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.65} />
      </radialGradient>
    </>
  );
}

function Rotulo({ texto, color = '#f8fafc', y = 26 }: { texto: string; color?: string; y?: number }) {
  return (
    <text
      className="escena-texto"
      x={200}
      y={y}
      textAnchor="middle"
      fill={color}
      opacity={0.78}
      fontSize={9}
      fontWeight={600}
      letterSpacing={3}
    >
      {texto.toUpperCase()}
    </text>
  );
}

/** Bici de carretera en silueta. */
function BiciSilueta({ x, y, escala = 1, color = '#05070c' }: { x: number; y: number; escala?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`} stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={0} cy={0} r={14} strokeWidth={2.2} />
      <circle cx={44} cy={0} r={14} strokeWidth={2.2} />
      <path d="M0 0 L17 -1 L36 -21 L15 -23 Z M15 -23 L13 -29 M10 -30 h8 M36 -21 L44 0 M36 -21 l1 -6 q6 -1 7 4" strokeWidth={2.4} />
    </g>
  );
}

/**
 * Ciclista sentado a contraluz, de perfil o de tres cuartos: el maillot asoma con la luz que le
 * llega de lado (`luz`: 1 desde la derecha, −1 desde la izquierda).
 */
function Sentado({
  x,
  y,
  maillot,
  luz,
  id,
  brazo,
  claseBrazo,
}: {
  x: number;
  y: number;
  maillot: string;
  /** Hacia dónde mira (1: derecha, −1: izquierda); la luz le llega de frente, de la mesa. */
  luz: 1 | -1;
  id: string;
  brazo: ReactNode;
  claseBrazo?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${luz} 1)`}>
      <defs>
        <linearGradient id={`ef-tronco-${id}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor={maillot} />
          <stop offset="0.55" stopColor={maillot} stopOpacity={0.35} />
          <stop offset="1" stopColor={SOMBRA} />
        </linearGradient>
      </defs>
      {/* taburete */}
      <path d="M-6 44 h22 M5 44 v38 M-3 82 h16" stroke="#05070c" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* piernas: muslo hacia delante y gemelo hacia abajo (culotte y piel en sombra) */}
      <path d="M2 40 L26 42 L24 76" stroke={SOMBRA} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 78 l9 2" stroke={SOMBRA} strokeWidth={5} strokeLinecap="round" />
      {/* tronco algo inclinado hacia la mesa */}
      <path
        d="M-8 42 C-10 24 -6 6 4 -2 C10 -6 18 -5 21 0 C24 10 20 28 16 42 Z"
        fill={`url(#ef-tronco-${id})`}
      />
      <path d="M21 0 C24 10 20 28 16 42" stroke={maillot} strokeWidth={1.2} fill="none" opacity={0.9} />
      {/* cuello, cabeza y gorra con la visera hacia delante */}
      <path d="M8 -4 L12 -11" stroke={SOMBRA} strokeWidth={6} strokeLinecap="round" />
      <ellipse cx={13} cy={-19} rx={8.5} ry={10} fill={SOMBRA} />
      <path d="M20.5 -19 c0.8 3 0.6 6 -1 9" stroke="#fde3c2" strokeWidth={1} fill="none" opacity={0.7} />
      <path d="M5 -24 q8 -8 16 -1 l6 1 q-10 1 -22 2 z" fill={maillot} opacity={0.85} />
      {/* brazo que sujeta la cerveza (gira desde el hombro) */}
      <g className={claseBrazo} style={{ transformOrigin: '12px 4px', transformBox: 'view-box' }}>
        <path d="M12 4 L22 24 L34 20" stroke={SOMBRA} strokeWidth={6.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 5 L23 22" stroke={maillot} strokeWidth={1} opacity={0.7} />
        {brazo}
      </g>
    </g>
  );
}

/** Vaso de cerveza con su espuma y burbujas. */
function Cerveza({ x, y, burbujas = true }: { x: number; y: number; burbujas?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-4.5 -14 L4.5 -14 L3.6 2 L-3.6 2 Z" fill="url(#ef-cerveza)" />
      <path d="M-4.8 -15.5 q4.8 -2.6 9.6 0 l-0.3 2 h-9 z" fill="#fff8e7" />
      <path d="M-2.8 -12 L-2.2 0" stroke="#fffbeb" strokeWidth={0.7} opacity={0.6} />
      {burbujas && (
        <>
          <circle className="escena-burbuja" cx={0.5} cy={-1} r={0.6} fill="#fff7d6" />
          <circle className="escena-burbuja b2" cx={2} cy={0} r={0.5} fill="#fff7d6" />
          <circle className="escena-burbuja b3" cx={-1.2} cy={-2} r={0.45} fill="#fff7d6" />
        </>
      )}
    </g>
  );
}

function Cervezas({ c }: { c: Colores }) {
  const bombillas = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const x = 10 + t * 380;
    const y = 30 + 26 * 4 * t * (1 - t) - 4;
    return { x, y, i };
  });
  return (
    <>
      <defs>
        <linearGradient id="ef-cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1430" />
          <stop offset="0.45" stopColor="#1e3a5f" />
          <stop offset="0.78" stopColor="#9a3412" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <Lineal id="ef-cerveza" de="#fbbf24" a="#b45309" />
        <Lineal id="ef-mesa" de="#3f2a1a" a="#120c08" />
        <Halo id="ef-bombilla" color="#ffd98a" />
        <Halo id="ef-calido" color="#f59e0b" />
        <Vineta />
      </defs>
      <rect width={400} height={260} fill="url(#ef-cielo)" />
      {/* ciudad a lo lejos con ventanas encendidas */}
      <path
        d="M0 150 v-22 h18 v-12 h14 v18 h12 v-30 h20 v26 h16 v-14 h22 v20 h10 v-36 h18 v32 h14 v-18 h24 v24 h12 v-40 h16 v36 h20 v-16 h18 v20 h22 v-28 h14 v24 h16 v-12 h20 v18 h14 v-24 h18 v30 V150 z"
        fill="#0c1222"
      />
      {[
        [24, 122], [52, 106], [56, 114], [92, 128], [122, 108], [126, 120], [168, 116], [200, 102],
        [204, 112], [246, 128], [262, 114], [300, 124], [330, 130], [362, 126], [380, 132],
      ].map(([x, y], i) => (
        <rect key={i} className={`escena-ventana v${i % 4}`} x={x} y={y} width={2.2} height={3} fill="#fcd34d" opacity={0.55} />
      ))}
      {/* suelo de la terraza */}
      <rect x={0} y={150} width={400} height={110} fill="#140e0b" />
      <ellipse cx={200} cy={196} rx={190} ry={50} fill="url(#ef-calido)" opacity={0.35} />
      {/* barandilla con dos bicis apoyadas */}
      <path d="M0 152 H400 M0 168 H400" stroke="#05070c" strokeWidth={2} />
      {[20, 60, 100, 300, 340, 380].map((x) => (
        <path key={x} d={`M${x} 152 V180`} stroke="#05070c" strokeWidth={2} />
      ))}
      <BiciSilueta x={24} y={176} escala={0.95} />
      <BiciSilueta x={318} y={176} escala={0.95} />
      {/* guirnalda de bombillas */}
      <path
        d={`M10 26 Q200 ${30 + 52 - 4} 390 26`}
        stroke="#05070c"
        strokeWidth={0.8}
        fill="none"
      />
      {bombillas.map(({ x, y, i }) => (
        <g key={i}>
          <circle className={`escena-luz l${i % 3}`} cx={x} cy={y + 3} r={11} fill="url(#ef-bombilla)" />
          <circle cx={x} cy={y + 3} r={1.6} fill="#fff4cc" />
        </g>
      ))}
      {/* los tres en la mesa alta */}
      <Sentado
        id="a"
        x={140}
        y={132}
        maillot={c.maillot}
        luz={1}
        brazo={<Cerveza x={34} y={20} />}
        claseBrazo="escena-trago"
      />
      <Sentado id="b" x={262} y={134} maillot="#38bdf8" luz={-1} brazo={<Cerveza x={34} y={20} />} claseBrazo="escena-trago d3" />
      <g opacity={0.92}>
        <Sentado id="c" x={204} y={120} maillot="#4ade80" luz={1} brazo={<Cerveza x={34} y={20} burbujas={false} />} claseBrazo="escena-trago d2" />
      </g>
      <ellipse cx={200} cy={170} rx={48} ry={6} fill="url(#ef-mesa)" />
      <path d="M200 176 V222 M186 222 h28" stroke="#05070c" strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={200} cy={168} rx={30} ry={3} fill="#f59e0b" opacity={0.25} />
      <rect width={400} height={260} fill="url(#ef-vineta)" />
      <Rotulo texto="Terraza · después de la sesión" />
    </>
  );
}

function Cama({ c }: { c: Colores }) {
  return (
    <>
      <defs>
        <Lineal id="ef-pared" de="#070b14" a="#0d1424" />
        <Halo id="ef-movil" color="#bfdbfe" />
        <Lineal id="ef-manta" de="#1e3a5f" a="#070b14" x2={1} y2={0.4} />
        <Lineal id="ef-noche" de="#0f1b33" a="#1c2b4a" />
        <Vineta />
      </defs>
      <rect width={400} height={260} fill="url(#ef-pared)" />
      {/* ventana: ciudad de noche desenfocada y lluvia */}
      <g>
        <rect x={238} y={30} width={130} height={92} rx={2} fill="url(#ef-noche)" />
        {[
          [252, 98, '#fbbf24'], [270, 84, '#93c5fd'], [296, 104, '#fbbf24'], [318, 90, '#f472b6'],
          [340, 100, '#fbbf24'], [356, 80, '#93c5fd'], [284, 70, '#fde68a'],
        ].map(([x, y, col], i) => (
          <circle key={i} className={`escena-ventana v${i % 4}`} cx={x as number} cy={y as number} r={4.5} fill={col as string} opacity={0.22} />
        ))}
        <clipPath id="ef-cristal">
          <rect x={238} y={30} width={130} height={92} />
        </clipPath>
        <g clipPath="url(#ef-cristal)" className="escena-lluvia">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d={`M${242 + i * 8} ${20 + (i * 37) % 70} l-2 9`} stroke="#93c5fd" strokeWidth={0.6} opacity={0.35} />
          ))}
        </g>
        <path d="M238 30 h130 v92 h-130 z M303 30 v92 M238 76 h130" stroke="#020409" strokeWidth={3} fill="none" />
      </g>
      {/* cabecero, almohada y cama */}
      <rect x={16} y={110} width={14} height={120} rx={3} fill="#05070c" />
      <path d="M30 168 C120 150 300 150 392 162 L392 236 L30 236 Z" fill="#0a1020" />
      <path d="M34 138 q30 -12 70 -2 q6 12 -4 22 q-34 6 -66 -2 z" fill="#1a2336" />
      {/* la luz del móvil */}
      <circle className="escena-brillo" cx={138} cy={128} r={70} fill="url(#ef-movil)" opacity={0.28} />
      {/* cabeza en la almohada, la cara iluminada por la pantalla */}
      <g>
        <ellipse cx={86} cy={132} rx={15} ry={12.5} fill={SOMBRA} />
        <path d="M98 126 c4 4 5 9 2 14 c-2 3 -5 4 -8 4" stroke="#bfdbfe" strokeWidth={1.4} fill="none" opacity={0.75} />
        <path d="M72 128 q12 -14 26 -4" fill={c.pelo} opacity={0.5} />
      </g>
      {/* manta con el maillot asomando, que respira */}
      <path d="M100 146 l18 -4 v14 l-18 2 z" fill={c.maillot} opacity={0.55} />
      <g className="escena-respira" style={{ transformOrigin: '230px 200px', transformBox: 'view-box' }}>
        <path d="M108 150 C170 132 300 140 392 152 L392 214 C300 206 180 210 108 204 Z" fill="url(#ef-manta)" />
        <path d="M120 152 C190 138 290 144 390 154" stroke="#93c5fd" strokeWidth={1} fill="none" opacity={0.25} />
      </g>
      {/* manos y móvil con el feed bajando */}
      <path d="M116 152 q8 -16 16 -20" stroke={SOMBRA} strokeWidth={7} fill="none" strokeLinecap="round" />
      <g transform="translate(126 106) rotate(-14)">
        <rect x={0} y={0} width={20} height={36} rx={3.5} fill="#020409" />
        <clipPath id="ef-pantalla">
          <rect x={1.6} y={2.4} width={16.8} height={31} rx={2} />
        </clipPath>
        <g clipPath="url(#ef-pantalla)">
          <rect x={1.6} y={2.4} width={16.8} height={31} fill="#f8fafc" />
          <g className="escena-scroll">
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} transform={`translate(0 ${5 + i * 10})`}>
                <circle cx={4.6} cy={1.2} r={1.4} fill="#cbd5e1" />
                <rect x={7} y={0} width={9} height={1.4} rx={0.6} fill="#334155" />
                <path d={`M3 ${4.5} q3 -2 5 0 t5 0 t4 -1`} stroke="#fc4c02" strokeWidth={0.8} fill="none" />
              </g>
            ))}
          </g>
          <rect x={1.6} y={2.4} width={16.8} height={3.2} fill="#fc4c02" />
        </g>
      </g>
      <rect width={400} height={260} fill="url(#ef-vineta)" />
      <Rotulo texto="Últimos kudos antes de dormir" color="#cbd5e1" y={250} />
    </>
  );
}

function Fisio({ c }: { c: Colores }) {
  return (
    <>
      <defs>
        <Lineal id="ef-sala" de="#d6dde6" a="#9aa7b6" />
        <linearGradient id="ef-rayo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <Lineal id="ef-camilla" de="#334155" a="#1e293b" />
        <Lineal id="ef-pierna" de={c.piel} a="#3b2a20" />
        <Lineal id="ef-bata" de="#1e3a5f" a="#0b1220" x2={1} y2={0} />
        <Vineta />
      </defs>
      <rect width={400} height={260} fill="url(#ef-sala)" />
      {/* ventana con luz de tarde entrando en diagonal */}
      <rect x={28} y={26} width={70} height={92} fill="#f1f5f9" />
      <path d="M28 26 h70 v92 h-70 z M63 26 v92 M28 72 h70" stroke="#94a3b8" strokeWidth={2.5} fill="none" />
      <path className="escena-rayo" d="M28 26 L98 26 L300 220 L130 240 Z" fill="url(#ef-rayo)" />
      <rect x={0} y={200} width={400} height={60} fill="#7b8794" />
      <ellipse cx={210} cy={214} rx={140} ry={10} fill="#000" opacity={0.2} />
      {/* planta y rodillo de espuma */}
      <path d="M352 200 h22 l-3 -26 h-16 z" fill="#475569" />
      <path className="escena-hoja" d="M362 174 c-14 -18 -10 -40 2 -54 c4 20 2 38 -2 54 c10 -20 22 -30 30 -32 c-6 18 -16 28 -30 32" fill="#1f5135" />
      <rect x={300} y={186} width={34} height={14} rx={7} fill="#0f766e" />
      {/* cuerpo del fisio, detrás de la camilla */}
      <g transform="translate(270 56)">
        <ellipse cx={0} cy={0} rx={9} ry={10.5} fill={SOMBRA} />
        <path d="M-6 9 L-5 15 M6 9 L5 15" stroke={SOMBRA} strokeWidth={5} />
        <path d="M-13 15 C-15 36 -13 62 -11 98 L11 98 C13 62 15 36 13 15 C6 11 -6 11 -13 15 Z" fill="url(#ef-bata)" />
        <path d="M-10 98 L-11 146 M9 98 L10 146" stroke="#0b1220" strokeWidth={9} strokeLinecap="round" />
      </g>
      {/* camilla con toalla */}
      <rect x={90} y={150} width={230} height={14} rx={4} fill="url(#ef-camilla)" />
      <path d="M106 164 v38 M304 164 v38" stroke="#1e293b" strokeWidth={5} />
      <rect x={96} y={146} width={60} height={6} rx={3} fill="#e2e8f0" />
      {/* ciclista boca abajo: cabeza en el hueco, maillot, culotte y piernas */}
      <ellipse cx={112} cy={140} rx={12} ry={9.5} fill={SOMBRA} />
      <path d="M122 132 C150 126 188 128 206 134 L206 148 L122 148 Z" fill={c.maillot} />
      <path d="M122 132 C150 126 188 128 206 134" stroke="#fff" strokeWidth={0.8} opacity={0.35} fill="none" />
      <path d="M204 134 C214 132 230 134 238 138 L238 148 L204 148 Z" fill="#111827" />
      <path d="M236 138 C262 136 288 140 306 142 L306 148 L236 148 Z" fill="url(#ef-pierna)" />
      <path d="M304 140 q8 -2 10 6" stroke={SOMBRA} strokeWidth={5} fill="none" strokeLinecap="round" />
      {/* fisio al otro lado: las manos repasan el gemelo, de la rodilla al tobillo */}
      <g transform="translate(270 56)">
        <g className="escena-masaje" style={{ transformOrigin: '0px 22px', transformBox: 'view-box' }}>
          <path d="M-10 20 C-14 44 -6 70 2 84" stroke="#1e3a5f" strokeWidth={6.5} fill="none" strokeLinecap="round" />
          <path d="M10 20 C16 44 16 70 14 84" stroke="#16304f" strokeWidth={6.5} fill="none" strokeLinecap="round" />
          <ellipse cx={3} cy={86} rx={5.5} ry={3} fill={c.piel} opacity={0.55} />
          <ellipse cx={15} cy={86} rx={5.5} ry={3} fill={c.piel} opacity={0.55} />
        </g>
      </g>
      <rect width={400} height={260} fill="url(#ef-vineta)" opacity={0.7} />
      <Rotulo texto="Descarga muscular" color="#0f172a" />
    </>
  );
}

export function EscenaFondo({ tipo, colores }: { tipo: EscenaFinal; colores: Colores }) {
  return (
    <svg className={`escena-final escena-${tipo}`} viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {tipo === 'cervezas' ? <Cervezas c={colores} /> : tipo === 'cama' ? <Cama c={colores} /> : <Fisio c={colores} />}
    </svg>
  );
}
