# Créditos de recursos 3D

Todos los recursos externos son de **dominio público (CC0)**: se pueden usar, modificar y
redistribuir sin atribución obligatoria. Aun así, se agradece a sus autores:

| Recurso | Autor | Licencia | Origen |
| --- | --- | --- | --- |
| Ciclista: cuerpos con esqueleto, peinados, barba y cejas (`modelos/ciclista/`) — *Universal Base Characters* (versión estándar) | Quaternius | CC0 | https://quaternius.itch.io/universal-base-characters |
| Árboles, arbustos, hierba, flores y rocas (`modelos/naturaleza/`) — *Stylized Nature MegaKit* (versión estándar) | Quaternius | CC0 | https://opengameart.org/content/stylized-nature-megakit |
| Asfalto `asphalt_02` (`texturas/asphalt_02_*`) | Poly Haven | CC0 | https://polyhaven.com/a/asphalt_02 |
| Hierba `sparse_grass` (`texturas/sparse_grass_*`) | Poly Haven | CC0 | https://polyhaven.com/a/sparse_grass |
| Grava de los arcenes `gravel_floor_02` (`texturas/gravel_floor_02_*`) | Poly Haven | CC0 | https://polyhaven.com/a/gravel_floor_02 |
| Cielo `kloofendal_48d_partly_cloudy_puresky` (`texturas/*.hdr`) | Poly Haven | CC0 | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |

Cambios realizados: texturas convertidas a JPG (piel y normales del ciclista a 2048 px,
cortezas a 1024 px, asfalto, hierba y grava a 2048 px; el cielo a 2k y 4k). En la vegetación
se suaviza la oclusión de los colores de vértice. La equipación del ciclista (maillot,
culotte, guantes, calcetines, zapatillas) se pinta por código sobre el cuerpo; casco, gafas,
correas y la bici también se generan por código. Las montañas del fondo y los bosques lejanos
(impostores de los árboles reales) se generan al cargar el recorrido.
