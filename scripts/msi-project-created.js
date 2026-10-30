'use strict';

/**
 * Hook para electron-builder: msiProjectCreated
 *
 * Executado após o projeto WiX (.wxs) ser gerado, mas antes da compilação do MSI.
 *
 * O electron-builder já registra os ProgIDs de cada extensão (ex.:
 * VisualizadordeFotos.jpg) via <ProgId>/<Extension>, mas NÃO cria as chaves
 * "Capabilities" nem "RegisteredApplications". Sem elas o aplicativo não aparece
 * em Configurações > Aplicativos > Aplicativos padrão.
 *
 * Este hook adiciona essas chaves diretamente ao WiX, de forma declarativa.
 * Assim o Windows Installer gerencia instalação, reparo e desinstalação, e o
 * registro funciona inclusive em instalação silenciosa (/quiet).
 *
 * Uso no package.json (build):
 *   "msiProjectCreated": "scripts/msi-project-created.js"
 */

const fs = require('node:fs');

const APP_NAME = 'Visualizador de Fotos';
const PROGID = 'VisualizadordeFotos';
const DESCRIPTION = 'Visualizador de fotos local para Windows';
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
const MARKER = 'AppCapabilitiesComponents';

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gera o ComponentGroup do WiX com as chaves de registro.
 * Usa um ProgID único (VisualizadordeFotos) com comando explícito, para que o
 * Windows consiga definir o app como padrão.
 */
function buildComponentGroup() {
  const fileCommand = `&quot;[#mainExecutable]&quot; &quot;%1&quot;`;
  const icon = `[#mainExecutable],0`;

  const fileAssociations = EXTENSIONS.map(
    (ext) =>
      `      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Capabilities\\FileAssociations" Name=".${ext}" Type="string" Value="${PROGID}" />`
  ).join('\n');

  return `  <ComponentGroup Id="${MARKER}">
    <Component Id="Registry_${PROGID}" Directory="APPLICATIONFOLDER" Guid="*">
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}" Type="string" Value="${xmlEscape(APP_NAME)}" KeyPath="yes" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Application" Name="ApplicationName" Type="string" Value="${xmlEscape(APP_NAME)}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Application" Name="ApplicationDescription" Type="string" Value="${xmlEscape(DESCRIPTION)}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Application" Name="ApplicationIcon" Type="string" Value="${icon}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\DefaultIcon" Type="string" Value="${icon}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\shell\\open\\command" Type="string" Value="${fileCommand}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Capabilities" Name="ApplicationName" Type="string" Value="${xmlEscape(APP_NAME)}" />
      <RegistryValue Root="HKCU" Key="Software\\Classes\\${PROGID}\\Capabilities" Name="ApplicationDescription" Type="string" Value="${xmlEscape(DESCRIPTION)}" />
${fileAssociations}
    </Component>
    <Component Id="Registry_RegisteredApplications" Directory="APPLICATIONFOLDER" Guid="*">
      <RegistryValue Root="HKCU" Key="Software\\RegisteredApplications" Name="${xmlEscape(APP_NAME)}" Type="string" Value="Software\\Classes\\${PROGID}\\Capabilities" KeyPath="yes" />
    </Component>
  </ComponentGroup>
`;
}

/**
 * @param {string} projectFile - Caminho absoluto do project.wxs gerado
 */
async function msiProjectCreated(projectFile) {
  if (!projectFile || !fs.existsSync(projectFile)) {
    throw new Error(`[msi-project-created] Arquivo WiX não encontrado: ${projectFile}`);
  }

  let content = fs.readFileSync(projectFile, 'utf8');

  if (content.includes(MARKER)) {
    console.log('[msi-project-created] Registro de associações já presente, pulando.');
    return;
  }

  const featureMatch = content.match(/<Feature\b[^>]*\bId="ProductFeature"[^>]*>([\s\S]*?)<\/Feature>/);
  if (!featureMatch) {
    throw new Error('[msi-project-created] Feature "ProductFeature" não encontrada no WiX.');
  }

  const productEnd = content.lastIndexOf('</Product>');
  if (productEnd === -1) {
    throw new Error('[msi-project-created] Tag </Product> não encontrada no WiX.');
  }

  // 1) Adiciona o ComponentGroupRef dentro do Feature principal.
  const featureBlock = featureMatch[0];
  const patchedFeatureBlock = featureBlock.replace(
    '</Feature>',
    `  <ComponentGroupRef Id="${MARKER}" />\n    </Feature>`
  );
  content = content.replace(featureBlock, patchedFeatureBlock);

  // 2) Insere a definição do ComponentGroup antes de </Product>.
  const componentGroup = buildComponentGroup();
  const productEndAfterPatch = content.lastIndexOf('</Product>');
  content =
    content.slice(0, productEndAfterPatch) +
    '\n' +
    componentGroup +
    content.slice(productEndAfterPatch);

  fs.writeFileSync(projectFile, content, 'utf8');
  console.log('[msi-project-created] Registro de associações (Capabilities) adicionado ao MSI.');
}

// electron-builder carrega o hook esperando um export default (ou module.exports = fn).
module.exports = msiProjectCreated;
module.exports.default = msiProjectCreated;
module.exports.msiProjectCreated = msiProjectCreated;