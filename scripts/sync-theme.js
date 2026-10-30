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

// i18next roda no processo principal e no renderer sem bundler: usamos o build
// UMD (CommonJS no Node, global `i18next` no navegador).
const i18nextSource = path.join(
  root,
  'node_modules',
  'i18next',
  'dist',
  'umd',
  'i18next.min.js'
);

if (!fs.existsSync(i18nextSource)) {
  console.error(`i18next não encontrado: ${i18nextSource}`);
  console.error('Execute "npm install" antes de iniciar ou empacotar o aplicativo.');
  process.exit(1);
}

fs.copyFileSync(i18nextSource, path.join(target, 'i18next.min.js'));
console.log('node_modules/i18next -> app/vendor/i18next.min.js');
