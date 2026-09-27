import { useEffect, useRef, useState } from 'react';
import { TEXTO_MAX, type Mensaje } from '../multijugador/useSalida';

interface Props {
  mensajes: Mensaje[];
  miUid: string | null;
  /** El chat no funciona (p. ej. faltan las reglas de Firebase). */
  rechazado: boolean;
  onEnviar: (texto: string) => Promise<boolean>;
}

/** Mensajes rápidos: se mandan con un toque, sin dejar de pedalear. */
const RAPIDOS = ['👍', '¡Vamos!', 'Espérame', 'Tira tú', 'Relevo', 'Subo fuerte', '😅', '🔥'];
/** Con el chat cerrado, cada mensaje nuevo se ve este tiempo. */
const VISIBLE_MS = 12000;

const hora = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Chat del grupo dentro del recorrido. Cerrado: los mensajes nuevos aparecen un rato y se
 * van solos. Abierto: la conversación, mensajes rápidos y un campo para escribir.
 */
export function ChatGrupo({ mensajes, miUid, rechazado, onEnviar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Hasta dónde he leído (para el contador de no leídos) y cuándo llegó cada mensaje
  const [leidoHasta, setLeidoHasta] = useState(() => Date.now());
  const llegada = useRef(new Map<string, number>());
  const [, refrescar] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const montaje = useRef(Date.now());
  const ahora = Date.now();
  // Los mensajes que ya estaban al entrar no cuentan como nuevos
  for (const m of mensajes)
    if (!llegada.current.has(m.id)) llegada.current.set(m.id, m.t > montaje.current - 5000 ? ahora : 0);

  // Con el chat abierto todo queda leído y se baja al último mensaje
  const ultimo = mensajes[mensajes.length - 1]?.id;
  useEffect(() => {
    if (!abierto) return;
    setLeidoHasta(Date.now());
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [abierto, ultimo]);

  // Repintar para que los mensajes recientes se oculten solos
  useEffect(() => {
    const id = setInterval(() => refrescar((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const noLeidos = mensajes.filter((m) => m.uid !== miUid && (llegada.current.get(m.id) ?? 0) > leidoHasta).length;
  const recientes = mensajes.filter((m) => ahora - (llegada.current.get(m.id) ?? 0) < VISIBLE_MS).slice(-3);

  const enviar = async (t: string) => {
    if (!t.trim() || enviando) return;
    setEnviando(true);
    const ok = await onEnviar(t);
    setEnviando(false);
    if (ok) setTexto('');
  };

  const burbuja = (m: Mensaje) => (
    <div key={m.id} className={`chat-mensaje ${m.uid === miUid ? 'mio' : ''}`}>
      <strong>{m.uid === miUid ? 'Tú' : m.nombre}</strong> {m.texto}
      {abierto && <span className="chat-hora">{hora(m.t)}</span>}
    </div>
  );

  if (!abierto)
    return (
      <div className="hud-chat">
        {recientes.length > 0 && <div className="chat-recientes">{recientes.map(burbuja)}</div>}
        <button className="boton-secundario chat-abrir" onClick={() => setAbierto(true)} title="Chat del grupo">
          💬 Chat{noLeidos > 0 && <span className="chat-contador">{noLeidos}</span>}
        </button>
      </div>
    );

  return (
    <div className="hud hud-chat abierto">
      <div className="chat-cabecera">
        <strong>💬 Chat del grupo</strong>
        <button className="chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el chat">
          ✕
        </button>
      </div>
      <div className="chat-lista" ref={lista}>
        {mensajes.length === 0 && <span className="chat-vacio">Aún no hay mensajes. ¡Saluda!</span>}
        {mensajes.map(burbuja)}
      </div>
      {rechazado && <span className="chat-error">Firebase no deja usar el chat: hay que pegar las reglas nuevas.</span>}
      <div className="chat-rapidos">
        {RAPIDOS.map((r) => (
          <button key={r} className="chat-rapido" onClick={() => void enviar(r)} disabled={enviando}>
            {r}
          </button>
        ))}
      </div>
      <form
        className="chat-escribir"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <input
          type="text"
          value={texto}
          maxLength={TEXTO_MAX}
          placeholder="Escribe un mensaje…"
          enterKeyHint="send"
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Mensaje"
        />
        <button className="boton-principal" type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
