/**
 * La conexión con Strava va con la cuenta: `usuarios/{uid}/strava` = { refresh, atleta, atletaId, t } o
 * { desconectado: true, t }. Solo la lee su dueño (reglas). Gana lo más reciente (`t`): si se conecta en el
 * iPad, el móvil lo recibe al momento; si se desconecta en uno, se desconecta en todos (Strava ya ha retirado
 * el permiso). Strava a veces cambia el refresh token al subir: el nuevo también se sube aquí.
 */
import { cargarFirebase } from '../cuenta/cuenta';
import { adoptarStravaDeNube, establecerEspejoStrava, estadoLocalStrava, marcaLocalStrava, type NubeStrava } from './strava';

const limpio = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function sincronizarStravaConNube(uid: string): () => void {
  let vivo = true;
  let quitar: (() => void) | null = null;
  void cargarFirebase().then(({ fb }) => {
    if (!vivo) return;
    const ref = fb.ref(fb.db, `usuarios/${uid}/strava`);
    const subir = (n: NubeStrava) => void fb.set(ref, limpio(n)).catch(() => {});
    establecerEspejoStrava(subir);
    quitar = fb.onValue(
      ref,
      (s) => {
        const n = s.val() as NubeStrava | null;
        const local = estadoLocalStrava();
        const valida = n && typeof n.t === 'number' && (n.desconectado || typeof n.refresh === 'string');
        if (!valida) {
          // La nube aún no sabe nada: se sube lo de este aparato (si lo hay)
          if (local) subir(local);
          return;
        }
        const tLocal = marcaLocalStrava();
        if (n!.t > tLocal || !local) adoptarStravaDeNube(n!);
        else if (n!.t < tLocal) subir(local);
      },
      () => {
        // Sin las reglas nuevas no se puede leer: cada aparato sigue con lo suyo
      },
    );
  });
  return () => {
    vivo = false;
    quitar?.();
    establecerEspejoStrava(null);
  };
}
