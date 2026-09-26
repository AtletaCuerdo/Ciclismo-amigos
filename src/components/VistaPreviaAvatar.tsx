/**
 * Vista previa 3D del ciclista, girando y pedaleando.
 * Se carga de forma diferida porque incluye Three.js.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { esDispositivoIos, type Avatar } from '../recorrido/avatar';
import { Ciclista3D } from '../recorrido/ciclista3d';

export default function VistaPreviaAvatar({ avatar, className }: { avatar: Avatar; className?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const ciclista = useRef<Ciclista3D | null>(null);
  const avatarInicial = useRef(avatar);

  useEffect(() => {
    const div = contenedor.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, esDispositivoIos() ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    div.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    // Luz de estudio: reflejos en el barniz del casco y de la bici
    const pmrem = new THREE.PMREMGenerator(renderer);
    const estudio = new RoomEnvironment();
    escena.environment = pmrem.fromScene(estudio, 0.04).texture;
    escena.environmentIntensity = 0.55;
    estudio.dispose();
    pmrem.dispose();
    escena.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.8));
    const sol = new THREE.DirectionalLight(0xfff4e6, 2.2);
    sol.position.set(1.2, 2.5, 1.5);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    Object.assign(sol.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 8 });
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.02;
    sol.shadow.radius = 4;
    escena.add(sol);
    const suelo = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.9 }),
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
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
      escena.environment?.dispose();
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
