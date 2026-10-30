/*!
 * viewerjs-gphotos.js
 * Configuração recomendada do ViewerJS para o tema viewerjs-gphotos.css.
 *
 * Este arquivo NÃO altera o ViewerJS: ele apenas cria a instância com as
 * opções que deixam a interface no formato do tema (barra no topo,
 * navegação lateral, imagem encostada nas bordas, sem filmstrip).
 *
 * Requer o ViewerJS já carregado (global `Viewer`).
 * Licença: MIT.
 */

(function (global) {
  'use strict';

  /**
   * Ordem dos botões na barra superior.
   * Todas as 11 ações nativas do ViewerJS permanecem disponíveis.
   */
  var TOOLBAR_ORDER = [
    'zoomOut',
    'zoomIn',
    'oneToOne',
    'reset',
    'rotateLeft',
    'rotateRight',
    'flipHorizontal',
    'flipVertical',
    'play',
    'prev',
    'next',
  ];

  var CONTRAST_BOUND = '__vjsGPhotosContrastBound';
  var LIGHT_THRESHOLD = 0.62;
  var SAMPLE_WIDTH = 32;
  var SAMPLE_HEIGHT = 12;
  var sampleCanvas = null;
  var sampleContext = null;

  function getSampleContext() {
    if (!sampleContext) {
      sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = SAMPLE_WIDTH;
      sampleCanvas.height = SAMPLE_HEIGHT;
      sampleContext = sampleCanvas.getContext
        && sampleCanvas.getContext('2d', { willReadFrequently: true });
    }

    return sampleContext;
  }

  /**
   * Calcula a luminância média (0 a 1) da parte visível da imagem que fica
   * atrás de uma região da interface (barra superior ou botão voltar).
   *
   * @returns {{luma: number, coverage: number}|null}
   */
  function sampleRegion(image, imageRect, region) {
    if (!image.complete || !image.naturalWidth) {
      return null;
    }

    var x0 = Math.max(region.left, imageRect.left);
    var x1 = Math.min(region.right, imageRect.right);
    var y0 = Math.max(region.top, imageRect.top);
    var y1 = Math.min(region.bottom, imageRect.bottom);

    if (x1 - x0 < 4 || y1 - y0 < 4) {
      return null;
    }

    var coverage = ((x1 - x0) * (y1 - y0))
      / Math.max(1, (region.right - region.left) * (region.bottom - region.top));

    var scaleX = image.naturalWidth / imageRect.width;
    var scaleY = image.naturalHeight / imageRect.height;
    var context = getSampleContext();

    if (!context) {
      return null;
    }

    try {
      context.drawImage(
        image,
        (x0 - imageRect.left) * scaleX,
        (y0 - imageRect.top) * scaleY,
        (x1 - x0) * scaleX,
        (y1 - y0) * scaleY,
        0,
        0,
        SAMPLE_WIDTH,
        SAMPLE_HEIGHT
      );

      var data = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
      var total = 0;

      for (var i = 0; i < data.length; i += 4) {
        total += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      }

      return {
        luma: total / (data.length / 4) / 255,
        coverage: coverage,
      };
    } catch (error) {
      // Imagem de outra origem sem CORS: mantém os ícones claros.
      return null;
    }
  }

  /**
   * Liga/desliga a classe de contraste conforme o brilho da imagem atrás dos
   * controles do topo. Assim os ícones ficam escuros sobre fotos claras.
   */
  function updateContrast(element) {
    var viewer = element.viewer;

    if (!viewer) {
      return;
    }

    // Sinaliza que a fileira tem mais botões do que cabe na tela.
    var listElement = viewer.toolbar && viewer.toolbar.querySelector('ul');

    if (listElement) {
      viewer.viewer.classList.toggle(
        'vjs-toolbar-scroll',
        listElement.scrollWidth > listElement.clientWidth + 1
      );
    }

    if (!viewer.image || viewer.played) {
      return;
    }

    // A amostragem usa o retângulo da imagem; com rotação o mapeamento não é
    // confiável, então mantemos a última cor até voltar a 0°.
    if (viewer.imageData && Math.abs(viewer.imageData.rotate % 360) > 0.01) {
      return;
    }

    var toolbarLight = false;
    var buttonLight = false;
    var imageRect = viewer.image.getBoundingClientRect();

    if (imageRect.width > 0 && imageRect.height > 0) {
      var list = viewer.toolbar && viewer.toolbar.querySelector('ul');
      var button = viewer.button;
      var regions = [];

      if (list) {
        var listRect = list.getBoundingClientRect();

        if (listRect.width > 0 && listRect.height > 0) {
          var pad = 8;

          regions.push({
            name: 'toolbar',
            left: listRect.left - pad,
            right: listRect.right + pad,
            top: listRect.top - pad,
            bottom: listRect.bottom + pad,
          });
        }
      }

      if (button && !button.classList.contains('viewer-hide')) {
        var buttonRect = button.getBoundingClientRect();

        if (buttonRect.width > 0 && buttonRect.height > 0) {
          var buttonPad = 6;

          regions.push({
            name: 'button',
            left: buttonRect.left - buttonPad,
            right: buttonRect.right + buttonPad,
            top: buttonRect.top - buttonPad,
            bottom: buttonRect.bottom + buttonPad,
          });
        }
      }

      for (var i = 0; i < regions.length; i += 1) {
        var region = regions[i];
        var sample = sampleRegion(viewer.image, imageRect, region);
        var isLight = !!sample && sample.coverage >= 0.5 && sample.luma >= LIGHT_THRESHOLD;

        if (isLight && region.name === 'toolbar') {
          toolbarLight = true;
        } else if (isLight && region.name === 'button') {
          buttonLight = true;
        }
      }
    }

    // Controles independentes: cada um se adapta ao que está atrás dele.
    viewer.viewer.classList.toggle('vjs-light-toolbar', toolbarLight);
    viewer.viewer.classList.toggle('vjs-light-button', buttonLight);
  }

  /**
   * Reamostra com debounce em cada evento que muda o enquadramento.
   */
  function bindContrast(element) {
    if (element[CONTRAST_BOUND]) {
      return;
    }

    element[CONTRAST_BOUND] = true;

    var timer = 0;
    var schedule = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        updateContrast(element);
      }, 80);
    };

    ['ready', 'shown', 'viewed', 'zoomed', 'moved', 'rotated', 'scaled', 'resized', 'stop'].forEach(
      function (name) {
        element.addEventListener(name, schedule);
      }
    );
  }

  function buildToolbar(overrides) {
    var toolbar = {
      position: 'top',
    };

    TOOLBAR_ORDER.forEach(function (name) {
      toolbar[name] = true;
    });

    if (overrides && typeof overrides === 'object') {
      Object.keys(overrides).forEach(function (key) {
        toolbar[key] = overrides[key];
      });
    }

    return toolbar;
  }

  /**
   * Cria um Viewer com o tema aplicado.
   *
   * @param {Element|String} element - Elemento (ou seletor) da galeria.
   * @param {Object} [options] - Opções extras do ViewerJS. Sobrescrevem os
   *   padrões do tema. `toolbar` é mesclado com a ordem acima.
   *   `chromeContrast: false` desliga a troca automática de cor dos ícones.
   * @returns {Viewer}
   */
  function createGPhotosViewer(element, options) {
    var ViewerCtor = global.Viewer;

    if (typeof ViewerCtor !== 'function') {
      throw new Error(
        'ViewerJS não encontrado. Carregue viewer.js/viewer.min.js antes de viewerjs-gphotos.js.'
      );
    }

    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) {
      throw new Error('createGPhotosViewer: elemento da galeria não encontrado.');
    }

    options = options || {};

    var chromeContrast = options.chromeContrast !== false;
    var config = {
      // Sem filmstrip: a interface fica só com a imagem e os controles.
      navbar: false,

      // Setas laterais apenas em telas maiores que 768px (no mobile: swipe).
      navigation: 2,

      // Imagem ocupa a maior área possível, encostando nas bordas.
      initialCoverage: 1,

      // Legenda discreta no rodapé.
      title: true,

      // Botão de fechar (seta) no topo esquerdo.
      button: true,

      transition: true,
    };

    Object.keys(options).forEach(function (key) {
      if (key !== 'toolbar' && key !== 'chromeContrast') {
        config[key] = options[key];
      }
    });

    if (options.toolbar === false) {
      config.toolbar = false;
    } else {
      config.toolbar = buildToolbar(options.toolbar);
    }

    var instance = new ViewerCtor(element, config);

    if (chromeContrast) {
      bindContrast(element);
      // Primeira amostragem depois que a interface foi montada.
      setTimeout(function () {
        updateContrast(element);
      }, 0);
    }

    return instance;
  }

  global.createGPhotosViewer = createGPhotosViewer;

  global.GPhotosViewerTheme = {
    create: createGPhotosViewer,
    toolbarOrder: TOOLBAR_ORDER.slice(),

    // Opções aplicadas por padrão; útil para inspecionar/estender.
    defaults: {
      navbar: false,
      navigation: 2,
      initialCoverage: 1,
      title: true,
      button: true,
      transition: true,
      chromeContrast: true,
      toolbar: buildToolbar(),
    },
  };
})(typeof window !== 'undefined' ? window : this);
