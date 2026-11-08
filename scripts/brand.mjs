// Gera as imagens do app recortando o panfleto original. Uso: npm run brand
import sharp from "sharp";

const FONTE = "d20445d1-eb92-4f2f-aab6-4bbe141f01c9.jpg";
const recorte = (left, top, width, height) => sharp(FONTE).extract({ left, top, width, height });

// Prato do combo (área sem texto do panfleto)
await recorte(598, 628, 601, 340).resize(960).webp({ quality: 82 }).toFile("public/img/combo.webp");
// Tambor da churrasqueira na rua
await recorte(0, 0, 495, 395).resize(800).webp({ quality: 80 }).toFile("public/img/churrasqueira.webp");

// Mascote em círculo, para logo e ícones
const mascote = await recorte(1010, 22, 180, 180).resize(512).png().toBuffer();
const disco = (size, inset = 0) => {
  const r = size / 2 - inset;
  return Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff"/></svg>`);
};
const redondo = async (size) =>
  sharp(mascote).resize(size, size).composite([{ input: disco(size), blend: "dest-in" }]).png().toBuffer();

await sharp(await redondo(256)).toFile("public/img/mascote.png");

async function icone(arquivo, size, fundo) {
  const margem = Math.round(size * 0.08);
  const miolo = await redondo(size - margem * 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: fundo } })
    .composite([{ input: miolo, left: margem, top: margem }])
    .png()
    .toFile(arquivo);
}
for (const size of [192, 512]) {
  await icone(`public/icons/loja-${size}.png`, size, "#d4140f");
  await icone(`public/icons/admin-${size}.png`, size, "#1c1917");
}
await icone("public/icons/apple-loja.png", 180, "#d4140f");
await icone("public/icons/apple-admin.png", 180, "#1c1917");
console.log("Imagens geradas em public/");
