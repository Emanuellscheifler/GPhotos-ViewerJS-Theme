'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app } = require('electron');

// Build UMD: funciona como CommonJS aqui e como global no renderer.
const i18next = require('../app/vendor/i18next.min.js');

const LOCALES_DIR = path.join(__dirname, '..', 'app', 'locales');
const SETTINGS_REGISTRY_KEY = 'HKCU\\Software\\Visualizador de Fotos';

// Fonte única dos idiomas: usada pelo app (main/renderer) e pelo instalador.
const catalog = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, 'languages.json'), 'utf8')
);

const SUPPORTED = catalog.languages.map((language) => language.code);
const FALLBACK = catalog.default;

// Um único namespace ("translation"): as chaves já são agrupadas por área
// (app.*, menu.*, dialog.*, errors.*), o que mantém a árvore idêntica nos 4
// arquivos e permite fallback por chave.
const NAMESPACES = ['translation'];

function readBundle(code) {
  return JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8')
  );
}

const resources = {};

for (const code of SUPPORTED) {
  const bundle = readBundle(code);
  resources[code] = { translation: bundle };
}

/**
 * Converte qualquer identificador de idioma (ex.: "pt_BR", "en-US", "ru")
 * em um dos idiomas suportados. Retorna '' quando não há correspondência.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeLocale(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const raw = value.trim().replace(/_/g, '-');

  if (!raw) {
    return '';
  }

  const lower = raw.toLowerCase();
  const exact = SUPPORTED.find((code) => code.toLowerCase() === lower);

  if (exact) {
    return exact;
  }

  const base = lower.split('-')[0];

  return SUPPORTED.find((code) => code.toLowerCase().split('-')[0] === base) || '';
}

/**
 * Lê o idioma escolhido no instalador (MSI). O instalador grava este valor em
 * HKCU antes de iniciar o aplicativo pela primeira vez.
 *
 * @returns {string}
 */
function readInstallerLocale() {
  try {
    const reg = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'reg.exe'
    );

    const output = execFileSync(
      reg,
      ['query', SETTINGS_REGISTRY_KEY, '/v', 'Locale'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    );

    const match = output.match(/Locale\s+REG_SZ\s+(\S+)/i);

    return match ? normalizeLocale(match[1]) : '';
  } catch {
    return '';
  }
}

/**
 * Idioma do sistema operacional, respeitando a lista de idiomas preferidos.
 *
 * @returns {string}
 */
function detectSystemLocale() {
  try {
    if (typeof app.getPreferredSystemLanguages === 'function') {
      for (const language of app.getPreferredSystemLanguages()) {
        const normalized = normalizeLocale(language);

        if (normalized) {
          return normalized;
        }
      }
    }

    return normalizeLocale(app.getLocale()) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/**
 * Resolve o idioma inicial: preferência salva > instalador > sistema > pt-BR.
 *
 * @param {string} [savedLocale]
 * @returns {string}
 */
function resolveInitialLocale(savedLocale) {
  return (
    normalizeLocale(savedLocale) ||
    readInstallerLocale() ||
    detectSystemLocale() ||
    FALLBACK
  );
}

/**
 * @param {string} [savedLocale]
 * @returns {Promise<string>}
 */
async function initI18n(savedLocale) {
  const lng = resolveInitialLocale(savedLocale);

  await i18next.init({
    lng,
    fallbackLng: FALLBACK,
    supportedLngs: SUPPORTED,
    ns: NAMESPACES,
    defaultNS: 'translation',
    resources,
    initAsync: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });

  return i18next.language;
}

/**
 * @param {string} key
 * @param {object} [options]
 * @returns {string}
 */
function t(key, options) {
  return i18next.t(key, options);
}

/**
 * @returns {string}
 */
function getLocale() {
  return i18next.language || FALLBACK;
}

/**
 * @param {string} locale
 * @returns {Promise<boolean>}
 */
async function setLocale(locale) {
  const normalized = normalizeLocale(locale);

  if (!normalized) {
    return false;
  }

  await i18next.changeLanguage(normalized);
  return true;
}

/**
 * @returns {Array<{code: string, label: string, englishName: string}>}
 */
function getLanguages() {
  return catalog.languages.map(({ code, label, englishName }) => ({
    code,
    label,
    englishName,
  }));
}

/**
 * Dados enviados ao renderer de forma síncrona, antes da primeira pintura.
 *
 * @returns {object}
 */
function getBootstrap() {
  return {
    locale: getLocale(),
    fallback: FALLBACK,
    namespaces: NAMESPACES,
    languages: getLanguages(),
    menuLabel: catalog.menuLabel,
    resources,
  };
}

function getMenuLabel() {
  return catalog.menuLabel;
}

module.exports = {
  FALLBACK,
  NAMESPACES,
  catalog,
  detectSystemLocale,
  getBootstrap,
  getLanguages,
  getLocale,
  getMenuLabel,
  initI18n,
  normalizeLocale,
  readInstallerLocale,
  resolveInitialLocale,
  setLocale,
  t,
};
