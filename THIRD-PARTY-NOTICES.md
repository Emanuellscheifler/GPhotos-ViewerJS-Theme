# Third-party notices

Este projeto usa e redistribui componentes de terceiros. Os avisos abaixo devem ser
mantidos junto com o código e com os binários distribuídos.

## ViewerJS

- Versão: 1.15.2
- Licença: MIT
- Autor: Chen Fengyuan
- https://github.com/fengyuanchen/viewerjs

Os arquivos `theme/viewerjs-gphotos.*` e `app/vendor/viewer.min.*` são carregados
localmente; o aplicativo não depende de CDN em tempo de execução.

## i18next

- Versão: 26.5.12
- Licença: MIT
- Copyright (c) 2022 i18next
- https://github.com/i18next/i18next

O build UMD (`app/vendor/i18next.min.js`) é copiado de `node_modules/i18next` pelo
script `scripts/sync-theme.js` e carregado localmente no processo principal e no
renderer. O pacote `i18next` é usado apenas no build (devDependency).

## Electron

- Licença: MIT
- Copyright (c) OpenJS Foundation e colaboradores do Electron
- https://github.com/electron/electron

## Electron Builder

- Usado apenas no processo de build (devDependency)
- Licença: MIT
- https://github.com/electron-userland/electron-builder

## Fotos de demonstração

As imagens em `theme/images/` são do [Lorem Picsum](https://picsum.photos), que usa
fotografias do Unsplash. Elas estão incluídas apenas para demonstração e **não** são
cobertas pela licença MIT deste projeto. Substitua-as pelas suas próprias imagens em
produção.

## Ícones

Os ícones do visualizador (`theme/icons/` e os SVGs em máscara nos arquivos CSS) foram
criados para este projeto e são licenciados sob MIT.

## Marcas

Google Photos é uma marca registrada da Google LLC. Este projeto não é afiliado,
endossado ou patrocinado pelo Google. Nenhum asset, ícone ou texto do Google Fotos é
incluído.
