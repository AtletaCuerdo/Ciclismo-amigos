import type { EstadoConexion } from '../ble/SensorBle';

export interface InfoConexion {
  estado: EstadoConexion;
  nombre?: string;
  error: string | null;
}

const TEXTO_ESTADO: Record<EstadoConexion, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando…',
  conectado: 'Conectado',
  reconectando: 'Reconectando…',
};

interface Props {
  titulo: string;
  detalle: string;
  info: InfoConexion;
  deshabilitado: boolean;
  onConectar: () => void;
  onDesconectar: () => void;
}

/** Botón grande de conexión con su estado y los posibles errores. */
export function TarjetaConexion({ titulo, detalle, info, deshabilitado, onConectar, onDesconectar }: Props) {
  const ocupado = info.estado === 'conectando';
  const activo = info.estado === 'conectado' || info.estado === 'reconectando';

  return (
    <div className={`tarjeta-conexion estado-${info.estado}`}>
      <button
        className="boton-conectar"
        onClick={onConectar}
        disabled={deshabilitado || ocupado}
        title={detalle}
      >
        {titulo}
      </button>
      <div className="linea-estado">
        <span className="punto" aria-hidden />
        <span>{TEXTO_ESTADO[info.estado]}</span>
        {info.nombre && activo && <span className="nombre-dispositivo">· {info.nombre}</span>}
      </div>
      <div className="detalle">{detalle}</div>
      {info.error && <div className="error-conexion">{info.error}</div>}
      {activo && (
        <button className="boton-secundario" onClick={onDesconectar}>
          Desconectar
        </button>
      )}
    </div>
  );
}
