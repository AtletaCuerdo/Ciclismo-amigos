import { useEffect, useState } from "react";
import {
  AjustesCsc,
  PRESETS,
  PRESET_PERSONALIZADO,
  potenciaDeAjustes,
} from "../potenciaVirtual";

interface Props {
  ajustes: AjustesCsc;
  onCambiar: (a: AjustesCsc) => void;
}

/**
 * Campo numérico que guarda el texto tal cual se escribe (se puede dejar vacío
 * o a medias, p. ej. "0,") y solo avisa hacia fuera cuando es un número válido.
 */
function CampoNumero({
  valor,
  onValido,
  min,
}: {
  valor: number;
  onValido: (v: number) => void;
  min?: number;
}) {
  const [texto, setTexto] = useState(String(valor));

  // Si el valor cambia desde fuera (p. ej. al elegir un preset), lo reflejamos.
  useEffect(() => {
    setTexto((t) =>
      Number(t.replace(",", ".")) === valor ? t : String(valor),
    );
  }, [valor]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const v = Number(e.target.value.replace(",", "."));
        if (
          e.target.value.trim() !== "" &&
          Number.isFinite(v) &&
          (min === undefined || v >= min)
        ) {
          onValido(v);
        }
      }}
      onBlur={() => setTexto(String(valor))}
    />
  );
}

/** Circunferencia de rueda y coeficientes de la potencia virtual. */
export function AjustesSensorCsc({ ajustes, onCambiar }: Props) {
  const conCurva =
    PRESETS.find((p) => p.id === ajustes.presetId)?.poli !== undefined;
  const elegirPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    onCambiar(
      p
        ? { ...ajustes, presetId: id, a: p.a, b: p.b }
        : { ...ajustes, presetId: id },
    );
  };

  return (
    <section className="panel">
      <h2>Ajustes del sensor de velocidad</h2>
      <div className="rejilla-ajustes">
        <label>
          Circunferencia de rueda (mm)
          <CampoNumero
            valor={ajustes.circunferencia}
            min={100}
            onValido={(v) => onCambiar({ ...ajustes, circunferencia: v })}
          />
        </label>
        <label>
          Rodillo (preset)
          <select
            value={ajustes.presetId}
            onChange={(e) => elegirPreset(e.target.value)}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            <option value={PRESET_PERSONALIZADO}>Personalizado</option>
          </select>
        </label>
        {!conCurva && (
          <>
            <label>
              a (lineal)
              <CampoNumero
                valor={ajustes.a}
                onValido={(v) =>
                  onCambiar({
                    ...ajustes,
                    a: v,
                    presetId: PRESET_PERSONALIZADO,
                  })
                }
              />
            </label>
            <label>
              b (cúbico)
              <CampoNumero
                valor={ajustes.b}
                onValido={(v) =>
                  onCambiar({
                    ...ajustes,
                    b: v,
                    presetId: PRESET_PERSONALIZADO,
                  })
                }
              />
            </label>
          </>
        )}
      </div>
      {conCurva ? (
        <div className="detalle">
          Curva de Elite para esta posición de la palanca: a 20 km/h ≈{" "}
          {Math.round(potenciaDeAjustes(20, ajustes))} W, a 30 km/h ≈{" "}
          {Math.round(potenciaDeAjustes(30, ajustes))} W y a 40 km/h ≈{" "}
          {Math.round(potenciaDeAjustes(40, ajustes))} W. Si mueves la palanca
          del manillar, cambia aquí también la posición.
        </div>
      ) : (
        <div className="detalle">
          Potencia estimada: P = a·v + b·v³ (v en km/h). A 30 km/h ≈{" "}
          {Math.round(ajustes.a * 30 + ajustes.b * 30 ** 3)} W.
        </div>
      )}
      <div className="detalle">
        El sensor de velocidad tiene que ir en la rueda trasera (la que gira
        sobre el rodillo). El plato y el piñón no cambian el cálculo: la
        potencia sale de la velocidad de la rueda y de la dureza del rodillo.
      </div>
    </section>
  );
}
