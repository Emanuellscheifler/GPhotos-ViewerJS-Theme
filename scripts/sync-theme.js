const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'theme');
const target = path.join(root, 'app', 'vendor');
const files = ['viewerjs-gphotos.css', 'viewerjs-gphotos.js'];

fs.mkdirSync(target, { recursive: true });

for (const file of files) {
  const from = path.join(source, file);
  const to = path.join(target, file);

  if (!fs.existsSync(from)) {
    console.error(`Arquivo do tema não encontrado: ${from}`);
    process.exit(1);
  }

  fs.copyFileSync(from, to);
  console.log(`theme/${file} -> app/vendor/${file}`);
}
