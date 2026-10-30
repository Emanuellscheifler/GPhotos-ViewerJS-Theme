'use strict';

const {
  app,
  BrowserWindow,
  protocol,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
} = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { Readable } = require('node:stream');
const { configureDefaultAppsRuntime } = require('./associations');
const {
  initI18n,
  t,
  getLocale,
  setLocale,
  getBootstrap,
  getLanguages,
  getMenuLabel,
  normalizeLocale,
} = require('./i18n');

const SCHEME = 'viewer';
const HOST = 'local';
const APP_ROOT = path.join(__dirname, '..', 'app');
const MAX_IMAGES = 3000;
const THUMB_CACHE_LIMIT = 400;

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.svg',
  '.ico',
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// A página e as imagens precisam compartilhar a mesma origem para o canvas do
// tema (contraste automático dos ícones) não ser bloqueado.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow = null;
let settings = {};
const allowedImages = new Set();
const thumbnailCache = new Map();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    settings = {};
  }
}

function saveSettings() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getNormalBounds();

    settings.window = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized(),
    };
  }

  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    // Preferência não crítica: segue sem salvar.
  }
}

// ---------------------------------------------------------------------------
// Primeira execução: oferece definir como visualizador padrão
// ---------------------------------------------------------------------------

let firstLaunchChecked = false;

function firstLaunchFlagFile() {
  return path.join(app.getPath('userData'), 'first-launch-complete');
}

function isFirstLaunch() {
  try {
    return !fs.existsSync(firstLaunchFlagFile());
  } catch {
    return true;
  }
}

function markFirstLaunchComplete() {
  try {
    fs.mkdirSync(path.dirname(firstLaunchFlagFile()), { recursive: true });
    fs.writeFileSync(firstLaunchFlagFile(), 'done', 'utf8');
  } catch {
    // Ignora erros
  }
}

// Garante que o diálogo apareça no máximo uma vez por execução.
function checkFirstLaunchOnce() {
  if (firstLaunchChecked) {
    return;
  }

  firstLaunchChecked = true;

  checkFirstLaunch().catch((error) => {
    console.error('Falha ao verificar a primeira execução:', error);
  });
}

async function checkFirstLaunch() {
  // Só faz sentido na versão instalada: em desenvolvimento as associações não
  // são registradas e o flag não deve consumir a primeira abertura real.
  if (!app.isPackaged) {
    return;
  }

  if (!isFirstLaunch()) {
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { dialog } = require('electron');

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: t('dialog.firstLaunch.title'),
    message: t('dialog.firstLaunch.message'),
    detail: t('dialog.firstLaunch.detail'),
    buttons: [t('dialog.firstLaunch.yes'), t('dialog.firstLaunch.no')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0) {
    // Usuário escolheu "Sim" - registra associações e abre configurações do Windows
    try {
      await configureDefaultAppsRuntime();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('default-apps:opened');
      }
    } catch (error) {
      console.error('Falha ao configurar visualizador padrão:', error);
    }
  }

  // Marca como concluído independentemente da escolha
  markFirstLaunchComplete();
}

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function textResponse(message, status = 404) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function serveFile(filePath) {
  let stat;

  try {
    stat = await fsp.stat(filePath);
  } catch {
    return textResponse(t('errors.fileNotFound'), 404);
  }

  if (!stat.isFile()) {
    return textResponse(t('errors.fileNotFound'), 404);
  }

  const stream = fs.createReadStream(filePath);

  return new Response(Readable.toWeb(stream), {
    status: 200,
    headers: {
      'content-type': mimeFor(filePath),
      'content-length': String(stat.size),
      'cache-control': 'no-cache',
    },
  });
}

async function serveThumbnail(filePath) {
  let stat;

  try {
    stat = await fsp.stat(filePath);
  } catch {
    return textResponse(t('errors.fileNotFound'), 404);
  }

  const cacheKey = `${filePath}|${stat.mtimeMs}|${stat.size}`;
  const cached = thumbnailCache.get(cacheKey);

  if (cached) {
    return pngResponse(cached);
  }

  let buffer = null;

  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
      width: 480,
      height: 480,
    });

    if (thumbnail && !thumbnail.isEmpty()) {
      buffer = thumbnail.toPNG();
    }
  } catch {
    // Sem miniatura nativa: usa a imagem original.
  }

  if (!buffer) {
    return serveFile(filePath);
  }

  if (thumbnailCache.size >= THUMB_CACHE_LIMIT) {
    const oldest = thumbnailCache.keys().next().value;
    thumbnailCache.delete(oldest);
  }

  thumbnailCache.set(cacheKey, buffer);

  return pngResponse(buffer);
}

function pngResponse(buffer) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function imageRecord(filePath) {
  const normalized = path.normalize(filePath);
  allowedImages.add(normalized);

  return {
    path: normalized,
    name: path.basename(normalized),
    url: `${SCHEME}://${HOST}/img/${encodeURIComponent(normalized)}`,
    thumb: `${SCHEME}://${HOST}/thumb/${encodeURIComponent(normalized)}`,
  };
}

// ---------------------------------------------------------------------------
// Listagem de imagens
// ---------------------------------------------------------------------------

async function listFolder(folderPath) {
  const folder = path.resolve(folderPath);
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const collator = new Intl.Collator(getLocale(), {
    numeric: true,
    sensitivity: 'base',
  });
  const names = entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name)
    .sort(collator.compare);

  const truncated = names.length > MAX_IMAGES;
  const files = names.slice(0, MAX_IMAGES).map((name) => path.join(folder, name));

  return {
    source: folder,
    sourceName: path.basename(folder) || folder,
    folder,
    images: files.map(imageRecord),
    truncated,
    maxImages: MAX_IMAGES,
  };
}

async function loadPaths(inputPaths) {
  const images = [];
  const seen = new Set();
  let source = '';
  let sourceName = '';
  let folder = '';
  let truncated = false;
  let hasFile = false;

  for (const input of inputPaths) {
    let resolved;
    let stat;

    try {
      resolved = path.resolve(input);
      stat = await fsp.stat(resolved);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const result = await listFolder(resolved);

      source = result.source;
      sourceName = result.sourceName;
      folder = result.folder;
      truncated = truncated || result.truncated;

      for (const image of result.images) {
        if (!seen.has(image.path)) {
          seen.add(image.path);
          images.push(image);
        }
      }
    } else if (stat.isFile() && isImageFile(resolved)) {
      hasFile = true;

      const image = imageRecord(resolved);

      if (!seen.has(image.path)) {
        seen.add(image.path);
        sourceName = sourceName || image.name;
        images.push(image);
      }
    }
  }

  if (images.length > MAX_IMAGES) {
    images.length = MAX_IMAGES;
    truncated = true;
  }

  if (!folder) {
    sourceName = images.length > 1
      ? t('app.status.selection')
      : (images[0] ? images[0].name : '');
  }

  // Abriu arquivos específicos (e não uma pasta): a interface abre a foto
  // diretamente no visualizador, em vez de mostrar a galeria de miniaturas.
  const openedFiles = hasFile && !folder;

  return {
    source,
    sourceName,
    folder,
    images,
    truncated,
    maxImages: MAX_IMAGES,
    openedFiles,
  };
}

function pathsFromArgv(argv) {
  // Em desenvolvimento o argv inclui o caminho do app e o cwd do projeto;
  // em produção inclui o próprio executável. Nada disso é uma foto.
  const ignored = new Set([
    path.resolve(app.getAppPath()),
    path.resolve(process.execPath),
    path.resolve(process.cwd()),
  ]);

  return argv
    .filter((arg) => arg && !arg.startsWith('-'))
    .map((arg) => path.resolve(arg))
    .filter((arg) => {
      if (ignored.has(arg)) {
        return false;
      }

      try {
        return fs.existsSync(arg);
      } catch {
        return false;
      }
    });
}

function guard(task) {
  return Promise.resolve()
    .then(task)
    .catch((error) => ({
      error:
        error && error.message
          ? error.message
          : t('errors.operationFailed'),
    }));
}

// ---------------------------------------------------------------------------
// Janela e menus
// ---------------------------------------------------------------------------

function sendImages(payload) {
  if (!mainWindow || mainWindow.isDestroyed() || !payload) {
    return;
  }

  mainWindow.webContents.send('images:loaded', payload);
}

async function pickFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('dialog.openFolder.title'),
    buttonLabel: t('dialog.openFolder.button'),
    defaultPath: app.getPath('pictures'),
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return listFolder(result.filePaths[0]);
}

async function pickFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('dialog.openPhotos.title'),
    buttonLabel: t('dialog.openPhotos.button'),
    defaultPath: app.getPath('pictures'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: t('dialog.openPhotos.filter'),
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg'],
      },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const payload = await loadPaths(result.filePaths);

  if (!payload.images.length) {
    return {
      ...payload,
      error: t('errors.noImagesInSelection'),
    };
  }

  return payload;
}

async function configureDefaultApps() {
  const result = await configureDefaultAppsRuntime();

  if (!result.ok) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: t('dialog.notInstalled.title'),
      message: t('dialog.notInstalled.message'),
      detail: t('dialog.notInstalled.detail'),
      buttons: ['OK'],
      noLink: true,
    });

    return result;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('default-apps:opened');
  }

  return result;
}

async function applyLocale(locale) {
  if (!(await setLocale(locale))) {
    return false;
  }

  settings.locale = getLocale();
  saveSettings();
  buildMenu();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('locale:changed', settings.locale);
  }

  return true;
}

function buildMenu() {
  const locale = getLocale();

  const template = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.openFolder'),
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            guard(pickFolder).then((payload) => {
              if (payload && !payload.error) {
                sendImages(payload);
              }
            });
          },
        },
        {
          label: t('menu.openPhotos'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            guard(pickFiles).then((payload) => {
              if (payload && !payload.error) {
                sendImages(payload);
              }
            });
          },
        },
        { type: 'separator' },
        {
          label: t('menu.setDefault'),
          click: () => {
            configureDefaultApps().catch((error) => {
              console.error(t('errors.operationFailed'), error);
            });
          },
        },
        { type: 'separator' },
        { label: t('menu.quit'), accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.fullscreen'),
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: t('menu.reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          },
        },
        { type: 'separator' },
        {
          label: t('menu.devtools'),
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
    {
      // Rótulo multilíngue fixo: o usuário precisa reconhecer a opção em
      // qualquer um dos idiomas suportados.
      label: getMenuLabel(),
      submenu: getLanguages().map((language) => ({
        label: language.label,
        type: 'radio',
        checked: locale === language.code,
        click: () => {
          applyLocale(language.code).catch((error) => {
            console.error(t('errors.operationFailed'), error);
          });
        },
      })),
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: t('dialog.about.title'),
              message: t('app.name'),
              detail: [
                t('dialog.about.version', { version: app.getVersion() }),
                '',
                t('dialog.about.detail'),
              ].join('\n'),
              buttons: ['OK'],
              noLink: true,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const bounds = settings.window || {};

  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    x: bounds.x,
    y: bounds.y,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0d0f11',
    title: 'Visualizador de Fotos',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(`${SCHEME}://${HOST}/index.html`);

  mainWindow.once('ready-to-show', () => {
    if (bounds.maximized) {
      mainWindow.maximize();
    }

    mainWindow.show();
    mainWindow.focus();

    // A janela já está visível: agora é seguro abrir o diálogo modal de
    // primeira execução sem que o show() o dispense com o botão padrão.
    checkFirstLaunchOnce();
  });

  mainWindow.on('close', saveSettings);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) {
      event.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Protocolo viewer://
// ---------------------------------------------------------------------------

async function handleProtocol(request) {
  let url;

  try {
    url = new URL(request.url);
  } catch {
    return textResponse(t('errors.invalidRequest'), 400);
  }

  if (url.host !== HOST) {
    return textResponse(t('errors.notFound'), 404);
  }

  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return textResponse(t('errors.invalidRequest'), 400);
  }

  if (!pathname || pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.startsWith('/img/')) {
    const filePath = path.normalize(pathname.slice('/img/'.length));

    if (!allowedImages.has(filePath)) {
      return textResponse(t('errors.notFound'), 404);
    }

    try {
      return await serveFile(filePath);
    } catch {
      return textResponse(t('errors.notFound'), 404);
    }
  }

  if (pathname.startsWith('/thumb/')) {
    const filePath = path.normalize(pathname.slice('/thumb/'.length));

    if (!allowedImages.has(filePath)) {
      return textResponse(t('errors.notFound'), 404);
    }

    try {
      return await serveThumbnail(filePath);
    } catch {
      return textResponse(t('errors.notFound'), 404);
    }
  }

  const appRoot = path.resolve(APP_ROOT);
  const target = path.resolve(appRoot, `.${pathname}`);

  if (target !== appRoot && !target.startsWith(appRoot + path.sep)) {
    return textResponse(t('errors.accessDenied'), 403);
  }

  try {
    return await serveFile(target);
  } catch {
    return textResponse(t('errors.notFound'), 404);
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:open-folder', () => guard(pickFolder));

ipcMain.handle('dialog:open-files', () => guard(pickFiles));

ipcMain.handle('default-apps:configure', () => guard(configureDefaultApps));

ipcMain.handle('paths:load', (event, inputPaths) =>
  guard(async () => {
    if (!Array.isArray(inputPaths) || !inputPaths.length) {
      return { error: t('errors.noFile') };
    }

    const clean = inputPaths.filter(
      (entry) => typeof entry === 'string' && entry.length > 0
    );
    const payload = await loadPaths(clean);

    if (!payload.images.length) {
      return { ...payload, error: t('errors.noImages') };
    }

    return payload;
  })
);

ipcMain.handle('app:initial', () =>
  guard(async () => {
    const fromArgv = pathsFromArgv(process.argv);
    const useDefaultFolder = fromArgv.length === 0;
    const initialPaths = useDefaultFolder ? [app.getPath('pictures')] : fromArgv;
    const payload = await loadPaths(initialPaths);

    if (useDefaultFolder && payload.sourceName) {
      // O Explorer exibe a pasta como "Imagens" em português.
      payload.sourceName = t('app.status.pictures');
      payload.defaultFolder = true;
    }

    if (!payload.images.length && !payload.sourceName) {
      return null;
    }

    return payload;
  })
);

// O renderer precisa do catálogo antes da primeira pintura; sendSync evita
// um "flash" de textos sem tradução na abertura.
ipcMain.on('i18n:bootstrap', (event) => {
  event.returnValue = getBootstrap();
});

ipcMain.handle('i18n:set', (event, locale) => applyLocale(locale));

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();

    const fromArgv = pathsFromArgv(argv);

    if (fromArgv.length) {
      guard(() => loadPaths(fromArgv)).then((payload) => {
        if (payload && !payload.error && payload.images.length) {
          sendImages(payload);
        }
      });
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    readSettings();

    const initialLocale = await initI18n(settings.locale);

    // Primeira abertura (ou idioma do instalador): persiste a escolha
    // detectada para as próximas execuções.
    if (normalizeLocale(settings.locale) !== initialLocale) {
      settings.locale = initialLocale;
      saveSettings();
    }

    protocol.handle(SCHEME, handleProtocol);

    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
