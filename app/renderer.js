'use strict';

(function () {
  const api = window.photoViewer;

  if (!api) {
    document.body.innerHTML =
      '<p style="font-family: Segoe UI, sans-serif; padding: 32px;">' +
      'Falha ao inicializar a interface do aplicativo.</p>';
    return;
  }

  const gallery = document.getElementById('galeria');
  const emptyState = document.getElementById('empty');
  const statusText = document.getElementById('status-text');
  const dropOverlay = document.getElementById('drop-overlay');
  const toast = document.getElementById('toast');
  const setDefaultButton = document.getElementById('set-default');

  const buttons = [
    document.getElementById('open-folder'),
    document.getElementById('open-files'),
    document.getElementById('empty-open-folder'),
    document.getElementById('empty-open-files'),
  ].filter(Boolean);

  let viewer = null;
  let hasImages = false;
  let busy = false;
  let dragDepth = 0;
  let toastTimer = 0;
  let toastHideTimer = 0;

  // Transição horizontal entre fotos (rápida).
  const SLIDE_DURATION = 200;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let slideState = null;
  let slideBound = false;

  function setBusy(next) {
    busy = next;
    document.body.classList.toggle('is-busy', busy);

    for (const button of buttons) {
      button.disabled = busy;
    }
  }

  function showToast(message) {
    if (!message) {
      return;
    }

    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);

    toast.textContent = message;
    toast.hidden = false;

    window.requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      toastHideTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 220);
    }, 3800);
  }

  function destroyViewer() {
    cleanupSlide();

    if (viewer) {
      viewer.destroy();
      viewer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Transição: deslize horizontal rápido entre fotos
  // -------------------------------------------------------------------------

  function cleanupSlide() {
    if (!slideState) {
      return;
    }

    window.clearTimeout(slideState.timer);

    if (slideState.layer && slideState.layer.parentNode) {
      slideState.layer.parentNode.removeChild(slideState.layer);
    }

    if (viewer && viewer.viewer) {
      viewer.viewer.classList.remove(
        'vjs-slide-pending',
        'vjs-sliding',
        'vjs-slide-next',
        'vjs-slide-prev'
      );
    }

    slideState = null;
  }

  function onViewStart(event) {
    const instance = gallery.viewer;

    if (!instance || reduceMotion.matches) {
      return;
    }

    // Uma navegação nova durante a animação anterior cancela a anterior.
    cleanupSlide();

    if (!instance.isShown || !instance.viewed || !instance.image) {
      return;
    }

    const detail = event.detail || {};
    const nextIndex = Number(detail.index);

    if (!Number.isFinite(nextIndex) || nextIndex === instance.index) {
      return;
    }

    const previousIndex = instance.index;
    let direction = nextIndex > previousIndex ? 'next' : 'prev';

    // Com loop, sair da última e voltar para a primeira é "next".
    if (previousIndex === instance.length - 1 && nextIndex === 0) {
      direction = 'next';
    } else if (previousIndex === 0 && nextIndex === instance.length - 1) {
      direction = 'prev';
    }

    const layer = document.createElement('div');
    layer.className = 'vjs-slide-layer';
    layer.setAttribute('aria-hidden', 'true');

    const clone = instance.image.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('aria-describedby');
    clone.alt = '';
    clone.draggable = false;
    clone.classList.add('vjs-slide-clone');

    // Distância suficiente para a foto antiga sair completamente da tela,
    // inclusive quando estiver ampliada/rotacionada.
    const rect = instance.image.getBoundingClientRect();
    const outDistance = Math.ceil(
      Math.max(
        direction === 'next'
          ? rect.right + 24
          : window.innerWidth - rect.left + 24,
        window.innerWidth * 0.6
      )
    );

    clone.style.setProperty(
      '--vjs-slide-out-distance',
      `${direction === 'next' ? -outDistance : outDistance}px`
    );

    layer.appendChild(clone);
    instance.canvas.insertAdjacentElement('afterend', layer);
    instance.viewer.classList.add('vjs-slide-pending');

    slideState = {
      layer,
      direction,
      timer: window.setTimeout(cleanupSlide, 5000),
    };
  }

  function onViewEnd() {
    if (!slideState) {
      return;
    }

    const instance = gallery.viewer;

    if (!instance) {
      cleanupSlide();
      return;
    }

    const { layer, direction } = slideState;

    window.clearTimeout(slideState.timer);

    instance.viewer.classList.remove('vjs-slide-pending');
    instance.viewer.classList.add(
      'vjs-sliding',
      direction === 'next' ? 'vjs-slide-next' : 'vjs-slide-prev'
    );
    layer.classList.add('vjs-old-run');

    slideState.timer = window.setTimeout(cleanupSlide, SLIDE_DURATION + 60);
  }

  function bindSlideTransition() {
    if (slideBound) {
      return;
    }

    slideBound = true;
    gallery.addEventListener('view', onViewStart);
    gallery.addEventListener('viewed', onViewEnd);
    gallery.addEventListener('hide', cleanupSlide);
  }

  function render(payload) {
    if (!payload) {
      return;
    }

    if (payload.error) {
      showToast(payload.error);
      return;
    }

    if (!Array.isArray(payload.images) || payload.images.length === 0) {
      if (payload.sourceName) {
        statusText.textContent = `${payload.sourceName} · nenhuma foto`;
        document.title = `${payload.sourceName} — Visualizador de Fotos`;
      }

      showToast(payload.error || 'Nenhuma imagem encontrada nesta pasta.');
      return;
    }

    destroyViewer();
    gallery.innerHTML = '';

    const fragment = document.createDocumentFragment();

    for (const image of payload.images) {
      const figure = document.createElement('figure');
      figure.className = 'tile';

      const img = document.createElement('img');
      img.src = image.thumb || image.url;
      img.dataset.full = image.url;
      img.alt = image.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;

      img.addEventListener(
        'error',
        () => {
          figure.classList.add('is-broken');
        },
        { once: true }
      );

      figure.appendChild(img);
      fragment.appendChild(figure);
    }

    gallery.appendChild(fragment);
    gallery.hidden = false;
    emptyState.hidden = true;
    hasImages = true;

    viewer = window.createGPhotosViewer(gallery, {
      title: true,
      // Sem a animação de crescimento do ViewerJS; usamos o deslize horizontal.
      transition: { view: false },
      url: (image) => image.dataset.full || image.src,
    });

    bindSlideTransition();

    const count = payload.images.length;
    const label = payload.sourceName || 'Seleção de fotos';
    const photos = count === 1 ? '1 foto' : `${count} fotos`;
    const limit = payload.truncated ? ' · limite de 3000' : '';

    statusText.textContent = `${label} · ${photos}${limit}`;
    document.title = `${label} — Visualizador de Fotos`;

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function run(task) {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const payload = await task();
      render(payload);
    } catch (error) {
      showToast(
        'Não foi possível abrir: ' +
          (error && error.message ? error.message : String(error))
      );
    } finally {
      setBusy(false);
    }
  }

  function openFolder() {
    run(() => api.openFolder());
  }

  function openFiles() {
    run(() => api.openFiles());
  }

  async function configureDefault() {
    try {
      const result = await api.configureDefaultApps();

      if (result && result.ok === false && result.reason === 'not-packaged') {
        showToast('Disponível na versão instalada do aplicativo.');
      }
    } catch (error) {
      showToast(
        'Não foi possível abrir as configurações: ' +
          (error && error.message ? error.message : String(error))
      );
    }
  }

  document.getElementById('open-folder').addEventListener('click', openFolder);
  document.getElementById('empty-open-folder').addEventListener('click', openFolder);
  document.getElementById('open-files').addEventListener('click', openFiles);
  document.getElementById('empty-open-files').addEventListener('click', openFiles);

  if (setDefaultButton) {
    setDefaultButton.addEventListener('click', configureDefault);
  }

  api.onDefaultAppsOpened(() => {
    showToast(
      'Na tela de Aplicativos padrão, escolha "Visualizador de Fotos" e defina como padrão.'
    );
  });

  // O menu nativo (Abrir pasta / Abrir fotos) envia o resultado por evento.
  api.onImagesLoaded((payload) => {
    if (payload) {
      render(payload);
    }
  });

  // -------------------------------------------------------------------------
  // Arrastar e soltar
  // -------------------------------------------------------------------------

  function isFileDrag(event) {
    const types = event.dataTransfer && event.dataTransfer.types;

    return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
  });

  window.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    dropOverlay.hidden = false;
  });

  window.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  window.addEventListener('dragleave', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);

    if (dragDepth === 0) {
      dropOverlay.hidden = true;
    }
  });

  window.addEventListener('drop', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;

    const files = Array.from(event.dataTransfer.files || []);
    const paths = files.map((file) => api.getPathForFile(file)).filter(Boolean);

    if (!paths.length) {
      showToast('Não foi possível obter o caminho dos arquivos soltos.');
      return;
    }

    run(() => api.loadPaths(paths));
  });

  // -------------------------------------------------------------------------
  // Inicialização
  // -------------------------------------------------------------------------

  if (!hasImages) {
    emptyState.hidden = false;
  }

  run(() => api.getInitial());
})();
