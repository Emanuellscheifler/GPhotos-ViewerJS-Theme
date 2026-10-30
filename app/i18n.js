'use strict';

/**
 * i18n do renderer.
 *
 * O catálogo completo (todos os idiomas) chega pelo preload em uma única
 * chamada síncrona, então a troca de idioma não precisa de rede nem de
 * recarregar a janela. Chaves ausentes caem no pt-BR.
 */
(function (global) {
  const api = global.photoViewer;
  const i18next = global.i18next;

  if (!api || !api.i18n || !i18next) {
    return;
  }

  const bootstrap = api.i18n;
  const languages = bootstrap.languages || [];
  const listeners = new Set();

  i18next.init({
    lng: bootstrap.locale,
    fallbackLng: bootstrap.fallback || 'pt-BR',
    supportedLngs: languages.map((language) => language.code),
    ns: bootstrap.namespaces,
    defaultNS: 'translation',
    resources: bootstrap.resources,
    initAsync: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });

  function t(key, options) {
    return i18next.t(key, options);
  }

  function getLocale() {
    return i18next.language;
  }

  function currentLanguage() {
    return (
      languages.find((language) => language.code === getLocale()) ||
      languages[0]
    );
  }

  function formatNumber(value) {
    try {
      return new Intl.NumberFormat(getLocale()).format(value);
    } catch {
      return String(value);
    }
  }

  function translateAttributes(root) {
    for (const element of root.querySelectorAll('[data-i18n]')) {
      element.textContent = t(element.getAttribute('data-i18n'));
    }

    for (const element of root.querySelectorAll('[data-i18n-title]')) {
      element.title = t(element.getAttribute('data-i18n-title'));
    }

    for (const element of root.querySelectorAll('[data-i18n-aria-label]')) {
      element.setAttribute(
        'aria-label',
        t(element.getAttribute('data-i18n-aria-label'))
      );
    }
  }

  function apply(root) {
    const scope = root || document;

    document.documentElement.lang = getLocale();
    translateAttributes(scope);

    const brokenLabel = t('app.gallery.broken');

    for (const tile of scope.querySelectorAll('.tile')) {
      tile.setAttribute('data-broken-label', brokenLabel);
    }
  }

  function notify() {
    apply();

    for (const listener of listeners) {
      listener(getLocale());
    }
  }

  async function setLocale(locale) {
    const success = await api.setLocale(locale);

    if (!success) {
      return false;
    }

    await i18next.changeLanguage(locale);
    notify();

    return true;
  }

  function onChange(listener) {
    listeners.add(listener);

    return () => listeners.delete(listener);
  }

  // Troca iniciada pelo menu nativo (main process).
  api.onLocaleChanged((locale) => {
    i18next.changeLanguage(locale).then(notify);
  });

  global.i18n = {
    t,
    apply,
    setLocale,
    onChange,
    getLocale,
    formatNumber,
    get language() {
      return currentLanguage();
    },
    languages,
  };
})(window);
