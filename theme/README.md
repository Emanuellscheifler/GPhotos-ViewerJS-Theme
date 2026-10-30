# ViewerJS · tema visualizador de fotos

Tema de interface para o [ViewerJS](https://github.com/fengyuanchen/viewerjs) inspirado em
visualizadores de fotos em tela cheia: fundo preto, imagem encostada nas bordas, seta de
voltar no topo esquerdo, ações discretas no topo direito e navegação lateral que aparece
no hover.

Não é um fork: o JavaScript do ViewerJS não é alterado e **todos os recursos originais
continuam disponíveis** (zoom, 1:1, reset, rotação, espelhamento, slideshow, navegação,
miniaturas, tela cheia, teclado, swipe, arrastar, roda do mouse). Nenhum texto, ícone ou
asset do Google Fotos é usado.

## Arquivos

| Arquivo | Descrição |
| --- | --- |
| `viewerjs-gphotos.css` | Tema completo (carregar depois de `viewer.css`) |
| `viewerjs-gphotos.js` | Helper opcional com as opções recomendadas |
| `viewerjs-gphotos-icons.css` | Variante para sites com CSP que bloqueia `data:` |
| `icons/*.svg` | Ícones individuais usados pela variante CSP |
| `demo.html` | Página de demonstração com 9 fotos (paisagem, retrato e imagem pequena) |

## Uso rápido

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/viewerjs@1.15.2/dist/viewer.min.css">
<link rel="stylesheet" href="viewerjs-gphotos.css">

<script src="https://cdn.jsdelivr.net/npm/viewerjs@1.15.2/dist/viewer.min.js"></script>
<script src="viewerjs-gphotos.js"></script>

<script>
  const viewer = createGPhotosViewer(document.getElementById('galeria'));
</script>
```

Se você já cria o Viewer manualmente, use estas opções:

```js
new Viewer(document.getElementById('galeria'), {
  navbar: false,          // sem filmstrip
  navigation: 2,          // setas laterais só acima de 768px
  initialCoverage: 1,     // imagem encostando nas bordas
  title: true,            // legenda discreta no rodapé
  button: true,           // seta de voltar no topo esquerdo
  transition: true,
  toolbar: {
    position: 'top',
    zoomOut: true,
    zoomIn: true,
    oneToOne: true,
    reset: true,
    rotateLeft: true,
    rotateRight: true,
    flipHorizontal: true,
    flipVertical: true,
    play: true,
    prev: true,
    next: true,
  },
});
```

A ordem das chaves em `toolbar` define a ordem dos botões. O helper já monta essa ordem e
permite sobrescrever qualquer opção:

```js
createGPhotosViewer('#galeria', {
  navbar: true,          // mostra as miniaturas com estilo discreto
  title: false,          // esconde a legenda
  chromeContrast: false, // mantém os ícones sempre claros
  toolbar: {
    prev: false,         // remove apenas o botão duplicado da barra
    next: false,
  },
});
```

## O que o tema faz

- **Barra superior flutuante.** O contêiner da barra recebe `height: 0` e a lista de botões
  é posicionada de forma absoluta. O ViewerJS calcula a área da imagem com
  `offsetTop + offsetHeight`; com altura zero a imagem usa a tela inteira e os controles
  ficam por cima, como na referência.
- **Imagem sem o limite de 90%.** O CSS original limita `.viewer-canvas > img` a 90% da
  largura. O tema troca para 100% e mantém as margens inline que o JS usa para posicionar
  e arrastar a imagem.
- **Ícones em máscara CSS.** Cada ação usa um SVG próprio como `mask-image` com
  `background-color: currentColor`, então o ícone acompanha a cor do botão no hover/focus.
  Os rótulos acessíveis originais do ViewerJS são preservados.
- **Seta de voltar** no topo esquerdo, reaproveitando o botão `close` do ViewerJS.
- **Contraste automático.** Quando a foto atrás dos controles é clara, os ícones da barra e
  a seta de voltar ficam escuros (como na referência). A decisão é tomada por amostragem
  de luminância no canvas, de forma independente para a barra e para o botão. Pode ser
  desligada com `chromeContrast: false`.
- **Setas laterais** translúcidas que aparecem no hover (sempre visíveis em dispositivos
  sem hover).
- **Legenda flutuante** no rodapé, sem reservar espaço e sem deslocar a imagem.
- **Miniaturas opcionais** com fundo translúcido, blur e destaque azul na ativa.

## Personalização

Todas as medidas e cores são variáveis CSS no `.viewer-container`:

| Variável | Padrão | Função |
| --- | --- | --- |
| `--vjs-bg` | `#000` | Fundo do visualizador |
| `--vjs-icon` | `#e8eaed` | Cor dos ícones |
| `--vjs-icon-hover` | `#fff` | Cor dos ícones no hover |
| `--vjs-hover-bg` | `rgba(255,255,255,.10)` | Fundo do botão no hover |
| `--vjs-active-bg` | `rgba(255,255,255,.16)` | Fundo do botão pressionado |
| `--vjs-focus` | `#8ab4f8` | Anel de foco por teclado |
| `--vjs-hit` | `40px` | Área de clique dos botões da barra |
| `--vjs-icon-size` | `20px` | Tamanho do ícone |
| `--vjs-inset` | `10px` | Distância das bordas |
| `--vjs-gap` | `2px` | Espaço entre botões |
| `--vjs-nav-size` | `48px` | Diâmetro das setas laterais |
| `--vjs-nav-inset` | `16px` | Distância das setas laterais |
| `--vjs-title-color` | `#e8eaed` | Cor da legenda |
| `--vjs-title-size` | `13px` | Tamanho da legenda |

Exemplo:

```css
.viewer-container {
  --vjs-bg: #111;
  --vjs-hit: 44px;
  --vjs-inset: 16px;
}
```

### Ícones personalizados

Cada botão expõe o ícone pela variável `--vjs-icon-svg`. Para trocar um ícone, use um SVG
como máscara (a cor vem do botão):

```css
.viewer-container .viewer-zoom-in {
  --vjs-icon-svg: url("icons/meu-zoom.svg");
}
```

Botões extras criados via `toolbar` também precisam dessa variável; sem ela a máscara não
é aplicada.

## Sites com Content-Security-Policy

O tema usa `data:` URIs nos ícones. Se a CSP do site não permitir `data:` em `img-src`,
carregue `viewerjs-gphotos-icons.css` **depois** de `viewerjs-gphotos.css` e mantenha a
pasta `icons/` junto do CSS:

```html
<link rel="stylesheet" href="viewerjs-gphotos.css">
<link rel="stylesheet" href="viewerjs-gphotos-icons.css">
```

## Compatibilidade

- `mask-image` com prefixo `-webkit-` cobre Chrome, Edge, Safari e Firefox atuais.
- O tema é só CSS; não depende de build, npm ou framework.
- O contraste automático usa canvas. Imagens de outra origem sem CORS deixam o canvas
  "tainted" e o script mantém os ícones claros (fallback silencioso); basta servir as
  imagens pela mesma origem ou com `crossorigin` para o recurso funcionar.
- Modo inline do ViewerJS continua com o botão de tela cheia no topo direito.
- Em telas estreitas a fileira de 11 botões rola horizontalmente (sem barra visível e com
  a borda direita esmaecida) em vez de esconder recursos.

## Testar

Abra `demo.html` diretamente no navegador ou, de preferência, use um servidor local
(necessário para o contraste automático dos ícones, porque o canvas é bloqueado em
`file://`):

```bash
npx --yes serve .
# ou
python -m http.server 8000
```

Os botões "Padrão", "Com miniaturas" e "Sem título" recriam o visualizador para comparar
as variações. `demo.html?auto=1` abre direto no primeiro retrato.

## Créditos e licença

- Código do tema: MIT.
- [ViewerJS](https://github.com/fengyuanchen/viewerjs) por Chen Fengyuan: MIT.
- Fotos da demonstração: [Lorem Picsum](https://picsum.photos) (Unsplash). Substitua-as
  pelas suas imagens em produção.
