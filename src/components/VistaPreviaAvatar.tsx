/**
 * Vista previa 3D del ciclista, girando y pedaleando.
 * Se carga de forma diferida porque incluye Three.js.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Avatar } from '../recorrido/avatar';
import { Ciclista3D } from '../recorrido/ciclista3d';

export default function VistaPreviaAvatar({ avatar, className }: { avatar: Avatar; className?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const ciclista = useRef<Ciclista3D | null>(null);
  const avatarInicial = useRef(avatar);

  useEffect(() => {
    const div = contenedor.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    div.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    escena.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(1, 2, 1.5);
    escena.add(sol);
    const suelo = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshLambertMaterial({ color: 0x2c313c }),
    );
    suelo.rotation.x = -Math.PI / 2;
    escena.add(suelo);

    const c = new Ciclista3D(avatarInicial.current);
    ciclista.current = c;
    const giro = new THREE.Group();
    giro.add(c.raiz);
    c.raiz.position.set(0, 0, 0);
    escena.add(giro);

    const camara = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camara.position.set(0, 1.3, 3.4);
    camara.lookAt(0, 0.75, 0);

    const ajustar = () => {
      const w = div.clientWidth || 1;
      const h = div.clientHeight || 1;
      renderer.setSize(w, h);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(div);
    ajustar();

    const reloj = new THREE.Clock();
    let id = 0;
    const bucle = () => {
      id = requestAnimationFrame(bucle);
      const dt = Math.min(0.1, reloj.getDelta());
      giro.rotation.y += dt * 0.5;
      c.pedalear(6, 85, dt);
      renderer.render(escena, camara);
    };
    bucle();

    return () => {
      cancelAnimationFrame(id);
      observador.disconnect();
      c.destruir();
      suelo.geometry.dispose();
      (suelo.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ciclista.current = null;
    };
  }, []);

  useEffect(() => {
    ciclista.current?.cambiarAvatar(avatar);
  }, [avatar]);

  return <div className={`vista-previa-avatar ${className ?? ''}`} ref={contenedor} />;
}
