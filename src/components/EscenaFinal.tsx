/**
 * Escenas animadas para el final de la sesión («Finalizar y ver estadísticas»): el resumen sale
 * encima. Son ilustraciones SVG con animaciones CSS: cargan al momento y no gastan memoria de la
 * GPU (en el iPad la escena 3D acaba de cerrarse).
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

/** Ciclista de pie (o sentado) con su maillot; el brazo derecho lleva lo que se le pase. */
function Ciclista({ x, y, c, brazo, clase = '' }: { x: number; y: number; c: Colores; brazo?: ReactNode; clase?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className={clase}>
      {/* piernas (culotte negro) */}
      <rect x={-11} y={34} width={9} height={34} rx={4} fill="#111827" />
      <rect x={2} y={34} width={9} height={34} rx={4} fill="#111827" />
      <ellipse cx={-7} cy={70} rx={8} ry={4} fill="#f8fafc" />
      <ellipse cx={7} cy={70} rx={8} ry={4} fill="#f8fafc" />
      {/* tronco con el maillot y una franja */}
      <rect x={-15} y={-2} width={30} height={40} rx={11} fill={c.maillot} />
      <rect x={-15} y={14} width={30} height={6} fill="#ffffff" opacity={0.35} />
      {/* brazo izquierdo */}
      <rect x={-21} y={2} width={8} height={28} rx={4} fill={c.maillot} />
      <circle cx={-17} cy={32} r={4} fill={c.piel} />
      {/* cabeza, pelo y gorra */}
      <circle cx={0} cy={-14} r={12} fill={c.piel} />
      <path d="M-12 -16 a12 12 0 0 1 24 0 z" fill={c.pelo} />
      <path d="M-13 -18 h24 a4 4 0 0 1 4 4 h-28 z" fill={c.maillot} />
      <circle cx={-4} cy={-13} r={1.4} fill="#111" />
      <circle cx={4} cy={-13} r={1.4} fill="#111" />
      <path d="M-4 -7 q4 3 8 0" stroke="#7c2d12" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* brazo derecho (el que se mueve) */}
      <g className="escena-brazo" style={{ transformOrigin: '17px 4px' }}>
        <rect x={13} y={2} width={8} height={28} rx={4} fill={c.maillot} />
        <circle cx={17} cy={32} r={4} fill={c.piel} />
        {brazo}
      </g>
    </g>
  );
}

function Jarra() {
  return (
    <g transform="translate(11 18)">
      <rect x={0} y={0} width={13} height={18} rx={2} fill="#fbbf24" opacity={0.92} />
      <rect x={0} y={-4} width={13} height={6} rx={3} fill="#fffbeb" />
      <path d="M13 4 h4 a3 3 0 0 1 0 8 h-4" stroke="#fde68a" strokeWidth={2} fill="none" />
      <circle className="escena-burbuja" cx={4} cy={14} r={1.2} fill="#fff7d6" />
      <circle className="escena-burbuja b2" cx={8} cy={15} r={1} fill="#fff7d6" />
      <circle className="escena-burbuja b3" cx={6} cy={12} r={0.9} fill="#fff7d6" />
    </g>
  );
}

function Bici({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round">
      <circle cx={0} cy={0} r={13} stroke="#1f2937" strokeWidth={3} />
      <circle cx={42} cy={0} r={13} stroke="#1f2937" strokeWidth={3} />
      <path d="M0 0 L16 -20 L36 -20 L42 0 M16 -20 L21 0 L0 0 M21 0 L36 -20 M14 -24 h7 M36 -20 l3 -8 h6" />
    </g>
  );
}

function Cervezas({ c }: { c: Colores }) {
  const amigo1 = { ...c, maillot: '#22d3ee', piel: '#e0ac69', pelo: '#3b2a1e' };
  const amigo2 = { ...c, maillot: '#4ade80', piel: '#8d5524', pelo: '#111' };
  return (
    <>
      <defs>
        <linearGradient id="ef-atardecer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.55" stopColor="#f97316" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <rect width={400} height={260} fill="url(#ef-atardecer)" />
      <circle className="escena-sol" cx={350} cy={22} r={14} fill="#fef3c7" opacity={0.9} />
      {/* fachada del bar y toldo */}
      <rect x={0} y={40} width={400} height={160} fill="#7c2d12" opacity={0.75} />
      <path d="M20 40 h360 l-14 24 h-332 z" fill="#b91c1c" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <path key={i} d={`M${34 + i * 45} 40 h22 l-4 24 h-22 z`} fill="#fef2f2" opacity={0.9} />
      ))}
      <text x={200} y={90} textAnchor="middle" fill="#fde68a" fontSize={16} fontWeight={800} letterSpacing={2}>
        BAR LA CUNETA
      </text>
      <Bici x={40} y={186} color={c.maillot} />
      <Bici x={300} y={186} color="#22d3ee" />
      {/* suelo y mesa */}
      <rect x={0} y={198} width={400} height={62} fill="#78350f" />
      <Ciclista x={150} y={130} c={c} brazo={<Jarra />} clase="escena-brindis" />
      <Ciclista x={200} y={124} c={amigo1} brazo={<Jarra />} clase="escena-brindis d2" />
      <Ciclista x={250} y={130} c={amigo2} brazo={<Jarra />} clase="escena-brindis d3" />
      <rect x={130} y={176} width={140} height={8} rx={3} fill="#a16207" />
      <rect x={196} y={184} width={8} height={40} fill="#713f12" />
      <text className="escena-texto" x={200} y={30} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={700}>
        ¡Salud! 🍻
      </text>
    </>
  );
}

function Cama({ c }: { c: Colores }) {
  return (
    <>
      <rect width={400} height={260} fill="#0b1220" />
      {/* ventana con luna y estrellas */}
      <rect x={250} y={30} width={110} height={80} rx={6} fill="#1e293b" stroke="#334155" strokeWidth={4} />
      <circle cx={325} cy={58} r={14} fill="#f8fafc" />
      <circle cx={331} cy={53} r={12} fill="#1e293b" />
      {[
        [268, 46],
        [290, 80],
        [345, 92],
        [300, 44],
      ].map(([x, y], i) => (
        <circle key={i} className={`escena-estrella e${i}`} cx={x} cy={y} r={1.6} fill="#fef9c3" />
      ))}
      <line x1={305} y1={30} x2={305} y2={110} stroke="#334155" strokeWidth={3} />
      {/* cama */}
      <rect x={40} y={150} width={300} height={50} rx={10} fill="#1e3a5f" />
      <rect x={30} y={120} width={16} height={100} rx={5} fill="#475569" />
      <rect x={50} y={132} width={70} height={26} rx={12} fill="#e2e8f0" />
      {/* cabeza en la almohada */}
      <circle cx={88} cy={132} r={15} fill={c.piel} />
      <path d="M73 129 a15 15 0 0 1 30 -2 z" fill={c.pelo} />
      <path d="M82 136 q5 3 10 0" stroke="#7c2d12" strokeWidth={1.6} fill="none" />
      <circle cx={83} cy={131} r={1.4} fill="#111" />
      <circle cx={94} cy={131} r={1.4} fill="#111" />
      {/* manta que respira, con el maillot asomando */}
      <path d="M100 142 h20 v12 h-20 z" fill={c.maillot} />
      <g className="escena-respira" style={{ transformOrigin: '220px 170px' }}>
        <path d="M112 148 q110 -26 228 6 v40 h-228 z" fill="#3b82f6" />
        <path d="M112 160 q110 -20 228 4" stroke="#93c5fd" strokeWidth={2} fill="none" opacity={0.5} />
      </g>
      {/* móvil con Strava: brillo naranja y la lista que baja */}
      <g transform="translate(118 108) rotate(-12)">
        <circle cx={10} cy={30} r={5} fill={c.piel} />
        <rect x={0} y={0} width={22} height={38} rx={4} fill="#111827" />
        <clipPath id="ef-pantalla">
          <rect x={2} y={3} width={18} height={32} rx={2} />
        </clipPath>
        <g clipPath="url(#ef-pantalla)">
          <rect x={2} y={3} width={18} height={32} fill="#fff7ed" />
          <g className="escena-scroll">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <g key={i} transform={`translate(0 ${4 + i * 9})`}>
                <rect x={4} y={0} width={14} height={2.5} rx={1} fill="#fc4c02" />
                <rect x={4} y={4} width={10} height={1.8} rx={1} fill="#94a3b8" />
              </g>
            ))}
          </g>
        </g>
      </g>
      <ellipse className="escena-brillo" cx={130} cy={124} rx={20} ry={26} fill="#fc4c02" opacity={0.15} />
      <text className="escena-zeta" x={70} y={100} fill="#93c5fd" fontSize={16} fontWeight={800}>
        z
      </text>
      <text className="escena-zeta d2" x={56} y={92} fill="#93c5fd" fontSize={12} fontWeight={800}>
        z
      </text>
      <text className="escena-texto" x={200} y={238} textAnchor="middle" fill="#cbd5e1" fontSize={14} fontWeight={700}>
        Un último vistazo a los kudos… 📱
      </text>
    </>
  );
}

function Fisio({ c }: { c: Colores }) {
  return (
    <>
      <rect width={400} height={260} fill="#e0f2fe" />
      <rect x={0} y={190} width={400} height={70} fill="#bae6fd" />
      {/* cuadro del esqueleto y planta */}
      <rect x={40} y={40} width={50} height={64} rx={4} fill="#fff" stroke="#7dd3fc" strokeWidth={3} />
      <circle cx={65} cy={58} r={6} fill="none" stroke="#0369a1" strokeWidth={2} />
      <path d="M65 64 v24 M55 72 h20 M65 88 l-7 10 M65 88 l7 10" stroke="#0369a1" strokeWidth={2} />
      <rect x={340} y={150} width={24} height={40} rx={4} fill="#a16207" />
      <path className="escena-hoja" d="M352 150 q-22 -30 -6 -54 q8 22 6 54 q14 -26 26 -40 q-4 30 -26 40" fill="#16a34a" />
      {/* camilla */}
      <rect x={90} y={150} width={220} height={16} rx={6} fill="#0f766e" />
      <rect x={104} y={166} width={8} height={30} fill="#64748b" />
      <rect x={288} y={166} width={8} height={30} fill="#64748b" />
      {/* ciclista boca abajo: cabeza, maillot y piernas */}
      <circle cx={112} cy={138} r={13} fill={c.piel} />
      <path d="M100 134 a13 13 0 0 1 24 -4 z" fill={c.pelo} />
      <rect x={124} y={128} width={74} height={22} rx={10} fill={c.maillot} />
      <rect x={196} y={130} width={40} height={18} rx={8} fill="#111827" />
      <rect x={232} y={132} width={66} height={14} rx={7} fill={c.piel} />
      {/* fisio con bata: brazos que masajean la pierna */}
      <g transform="translate(250 64)">
        <rect x={-16} y={20} width={32} height={50} rx={10} fill="#ffffff" stroke="#cbd5e1" />
        <circle cx={0} cy={6} r={12} fill="#c68642" />
        <path d="M-12 4 a12 12 0 0 1 24 0 z" fill="#1f2937" />
        <circle cx={-4} cy={7} r={1.4} fill="#111" />
        <circle cx={4} cy={7} r={1.4} fill="#111" />
        <rect x={-14} y={70} width={10} height={56} rx={4} fill="#1e40af" />
        <rect x={4} y={70} width={10} height={56} rx={4} fill="#1e40af" />
        <g className="escena-masaje">
          <path d="M-12 30 q-8 26 2 38" stroke="#ffffff" strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d="M12 30 q8 26 -2 38" stroke="#ffffff" strokeWidth={9} fill="none" strokeLinecap="round" />
          <circle cx={-10} cy={70} r={5} fill="#c68642" />
          <circle cx={10} cy={70} r={5} fill="#c68642" />
        </g>
      </g>
      <text className="escena-texto" x={200} y={30} textAnchor="middle" fill="#0369a1" fontSize={15} fontWeight={700}>
        Piernas como nuevas para mañana 💆
      </text>
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
