// Comprime las texturas JPG de public/texturas a KTX2 (UASTC con mipmaps).
// Uso (fuera del proyecto o con las dependencias sin guardar):
//   npm i --no-save ktx2-encoder sharp && node herramientas/comprimir-texturas.mjs
// Tarda unos 3 minutos por textura de 2k.
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import fs from 'fs';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../public/texturas/', import.meta.url));
const decoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
  const normal = f.includes('_nor_');
  const color = f.includes('_diff_');
  const t = Date.now();
  const out = await encodeToKTX2(new Uint8Array(fs.readFileSync(dir + f)), {
    isUASTC: true, uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: 1.5, needSupercompression: true,
    generateMipmap: true, isNormalMap: normal, isPerceptual: color, imageDecoder: decoder,
  });
  fs.writeFileSync(dir + f.replace('.jpg', '.ktx2'), out);
  console.log(f, (out.length / 1e6).toFixed(2), 'MB', Date.now() - t, 'ms');
}
