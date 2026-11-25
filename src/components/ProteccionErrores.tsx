/**
 * Si algo de la web falla al pintarse, en lugar de quedarse la pantalla en negro se enseña qué ha
 * pasado (para mandar una captura) y un botón para recargar. Lo grabado de la sesión en curso se
 * guarda aparte, así que al volver a abrir se puede continuar.
 */
import { Component, type ReactNode } from 'react';

interface Estado {
  error: Error | null;
}

export class ProteccionErrores extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('RideCrew: fallo al pintar la web', error, info.componentStack);
  }

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const detalle = `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 6).join('\n')}`;
    return (
      <main className="pantalla-fallo">
        <h1>😵 Algo ha fallado en RideCrew</h1>
        <p>
          Haz una <strong>captura de esta pantalla</strong> y mándasela a Jesús para que lo arreglemos. Lo que llevabas
          grabado no se pierde: al recargar podrás continuar la sesión.
        </p>
        <pre>{detalle}</pre>
        <button className="boton-principal" onClick={() => location.reload()}>
          🔄 Recargar RideCrew
        </button>
      </main>
    );
  }
}
