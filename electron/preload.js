'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('photoViewer', {
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  loadPaths: (paths) => ipcRenderer.invoke('paths:load', paths),
  getInitial: () => ipcRenderer.invoke('app:initial'),

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
