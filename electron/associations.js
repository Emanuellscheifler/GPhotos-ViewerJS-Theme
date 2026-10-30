'use strict';

const { app } = require('electron');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const APP_NAME = 'Visualizador de Fotos';
const PROGID_PREFIX = 'VisualizadordeFotos';
const DESCRIPTION = 'Visualizador de fotos local para Windows';
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];

const APP_KEY = `HKCU\\Software\\Classes\\${PROGID_PREFIX}`;
const CAPABILITIES_KEY = `${APP_KEY}\\Capabilities`;
const REGISTERED_APPLICATIONS_KEY = 'HKCU\\Software\\RegisteredApplications';

function regExe() {
  return path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'reg.exe'
  );
}

async function addValue(key, name, value, type = 'REG_SZ') {
  const args = ['add', key];

  if (name === null) {
    args.push('/ve');
  } else {
    args.push('/v', name);
  }

  args.push('/t', type);

  if (value !== null) {
    args.push('/d', value);
  }

  args.push('/f');

  await execFileAsync(regExe(), args, {
    windowsHide: true,
  });
}

/**
 * Registra o aplicativo como candidato a visualizador padrão no Windows.
 *
 * Isso cria as chaves de "Capabilities" em HKCU, que fazem o app aparecer em
 * Configurações > Aplicativos > Aplicativos padrão. O Windows 10/11 não permite
 * definir o padrão silenciosamente: a escolha final é sempre do usuário.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function registerAssociations() {
  if (!app.isPackaged) {
    return { ok: false, reason: 'not-packaged' };
  }

  const exe = process.execPath;
  const icon = `"${exe}",0`;
  const command = `"${exe}" "%1"`;

  await addValue(APP_KEY, null, APP_NAME);

  await addValue(`${APP_KEY}\\Application`, 'ApplicationName', APP_NAME);
  await addValue(`${APP_KEY}\\Application`, 'ApplicationIcon', icon);
  await addValue(
    `${APP_KEY}\\Application`,
    'ApplicationDescription',
    DESCRIPTION
  );

  await addValue(`${APP_KEY}\\DefaultIcon`, null, icon);
  await addValue(`${APP_KEY}\\shell\\open\\command`, null, command);

  await addValue(CAPABILITIES_KEY, 'ApplicationName', APP_NAME);
  await addValue(CAPABILITIES_KEY, 'ApplicationDescription', DESCRIPTION);

  for (const extension of EXTENSIONS) {
    const progId = `${PROGID_PREFIX}.${extension}`;

    await addValue(
      `${CAPABILITIES_KEY}\\FileAssociations`,
      `.${extension}`,
      progId
    );

    // Garante que o app apareça em "Abrir com" para o tipo de arquivo.
    await addValue(
      `HKCU\\Software\\Classes\\.${extension}\\OpenWithProgids`,
      progId,
      null,
      'REG_NONE'
    );
  }

  await addValue(
    REGISTERED_APPLICATIONS_KEY,
    APP_NAME,
    `Software\\Classes\\${PROGID_PREFIX}\\Capabilities`
  );

  return { ok: true };
}

module.exports = {
  APP_NAME,
  EXTENSIONS,
  PROGID_PREFIX,
  registerAssociations,
};
