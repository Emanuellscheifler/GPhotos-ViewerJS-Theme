'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Catálogo completo (4 idiomas) + idioma atual, entregue de forma síncrona
// para o renderer traduzir a interface antes da primeira pintura.
const i18n = ipcRenderer.sendSync('i18n:bootstrap');

contextBridge.exposeInMainWorld('photoViewer', {
  i18n,
  setLocale: (locale) => ipcRenderer.invoke('i18n:set', locale),
  onLocaleChanged: (callback) => {
    const listener = (event, locale) => callback(locale);
    ipcRenderer.on('locale:changed', listener);
    return () => ipcRenderer.removeListener('locale:changed', listener);
  },

  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  loadPaths: (paths) => ipcRenderer.invoke('paths:load', paths),
  getInitial: () => ipcRenderer.invoke('app:initial'),
  configureDefaultApps: () => ipcRenderer.invoke('default-apps:configure'),

  onDefaultAppsOpened: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('default-apps:opened', listener);
    return () => ipcRenderer.removeListener('default-apps:opened', listener);
  },

  // Electron 32+ removeu File.path; webUtils resolve o caminho no preload.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  onImagesLoaded: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('images:loaded', listener);
    return () => ipcRenderer.removeListener('images:loaded', listener);
  },
});
