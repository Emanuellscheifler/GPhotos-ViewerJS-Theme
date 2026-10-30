'use strict';

/**
 * Hook para electron-builder: msiProjectCreated
 *
 * Executado após o projeto WiX (.wxs) ser gerado, mas antes da compilação do MSI.
 *
 * Responsabilidades:
 *  1. Registrar o app em "Abrir com" / "Aplicativos padrão" (Capabilities +
 *     RegisteredApplications), inclusive em instalações silenciosas (/quiet).
 *  2. Exibir uma tela de seleção de idioma no início do instalador e gravar a
 *     escolha em HKCU\Software\Visualizador de Fotos\Locale, para o aplicativo
 *     usar na primeira abertura.
 *
 * A lista de idiomas vem de app/locales/languages.json: a mesma fonte usada
 * pelo menu do aplicativo. Assim instalação e runtime nunca divergem.
 *
 * Uso no package.json (build):
 *   "msiProjectCreated": "scripts/msi-project-created.js"
 */

const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Visualizador de Fotos';
const PROGID = 'VisualizadordeFotos';
const DESCRIPTION = 'Visualizador de fotos local para Windows';
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
const MARKER = 'AppCapabilitiesComponents';
const SETTINGS_KEY = 'Software\\Visualizador de Fotos';
const LOCALE_PROPERTY = 'APP_LOCALE';

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'app', 'locales', 'languages.json'),
    'utf8'
  )
);

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
    <Component Id="Registry_AppSettings" Directory="APPLICATIONFOLDER" Guid="*">
      <RegistryValue Root="HKCU" Key="${SETTINGS_KEY}" Name="Locale" Type="string" Value="[${LOCALE_PROPERTY}]" KeyPath="yes" />
    </Component>
  </ComponentGroup>
`;
}

function buildComboItems() {
  const items = [
    `<ListItem Text="${xmlEscape(catalog.automaticLabel)}" Value="auto" />`,
  ];

  for (const language of catalog.languages) {
    items.push(
      `<ListItem Text="${xmlEscape(language.label)}" Value="${xmlEscape(language.code)}" />`
    );
  }

  return items.map((item) => `        ${item}`).join('\n');
}

/**
 * Tela inicial de idioma. Rótulo e descrição são multilíngues de propósito:
 * o MSI do electron-builder tem um único idioma (en-US) e não é traduzido
 * dinamicamente, então a tela precisa ser compreensível nos 4 idiomas.
 */
function buildLanguageDialog() {
  return `  <UI>
    <Dialog Id="AppLanguageDlg" Width="370" Height="270" Title="[ProductName]">
      <Control Id="BannerBitmap" Type="Bitmap" X="0" Y="0" Width="370" Height="44" TabSkip="no" Text="WixUI_Bmp_Banner" />
      <Control Id="Title" Type="Text" X="15" Y="6" Width="340" Height="15" Transparent="yes" NoPrefix="yes" Text="{\\WixUI_Font_Title}${xmlEscape(catalog.installerTitle)}" />
      <Control Id="Description" Type="Text" X="25" Y="23" Width="320" Height="15" Transparent="yes" NoPrefix="yes" Text="${xmlEscape(catalog.installerDescription)}" />
      <Control Id="BannerLine" Type="Line" X="0" Y="44" Width="370" Height="0" />
      <Control Id="BottomLine" Type="Line" X="0" Y="243" Width="370" Height="0" />
      <Control Id="LanguageCombo" Type="ComboBox" Property="${LOCALE_PROPERTY}" ComboList="yes" Sorted="no" X="20" Y="96" Width="250" Height="18">
        <ComboBox Property="${LOCALE_PROPERTY}">
${buildComboItems()}
        </ComboBox>
      </Control>
      <Control Id="Back" Type="PushButton" X="180" Y="243" Width="56" Height="17" Text="!(loc.WixUIBack)">
        <Publish Event="NewDialog" Value="WelcomeDlg" />
      </Control>
      <Control Id="Next" Type="PushButton" X="236" Y="243" Width="56" Height="17" Default="yes" Text="!(loc.WixUINext)">
        <Publish Event="NewDialog" Value="InstallScopeDlg" />
      </Control>
      <Control Id="Cancel" Type="PushButton" X="304" Y="243" Width="56" Height="17" Cancel="yes" Text="!(loc.WixUICancel)">
        <Publish Event="SpawnDialog" Value="CancelDlg" />
      </Control>
    </Dialog>
  </UI>

  <Property Id="${LOCALE_PROPERTY}" Value="auto" Secure="yes" />
`;
}

/**
 * Pré-seleciona o idioma do Windows no combo. O MSI não tem wildcard de LCID,
 * então mapeamos os LCIDs mais comuns de cada idioma suportado.
 */
function buildLocaleDetection() {
  const customs = [];
  const sequence = [];

  for (const language of catalog.languages) {
    for (const lcid of language.lcids || []) {
      const id = `SetLocale_${language.code.replace(/-/g, '')}_${lcid}`;

      customs.push(
        `  <CustomAction Id="${id}" Property="${LOCALE_PROPERTY}" Value="${xmlEscape(language.code)}" />`
      );
      sequence.push(
        `    <Custom Action="${id}" After="CostFinalize">NOT Installed AND UserLanguageID=${lcid}</Custom>`
      );
    }
  }

  return `${customs.join('\n')}

  <InstallUISequence>
${sequence.join('\n')}
  </InstallUISequence>
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

  // O WiX 4.0.5512 usado pelo electron-builder gera o banco em 1252, que não
  // comporta cirílico. Um arquivo de localização com Codepage="65001" (UTF-8)
  // é a única forma de mudar a code page do banco; ele é passado ao light em
  // package.json > build.msi.additionalLightArgs.
  fs.writeFileSync(
    path.join(path.dirname(projectFile), 'locale.wxl'),
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<WixLocalization Culture="en-US" Codepage="65001" ' +
      'xmlns="http://wixtoolset.org/schemas/v4/wxl">\n' +
      '</WixLocalization>\n',
    'utf8'
  );

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

  // 2) Instalador assistido (WixUI_InstallDir): insere a tela de idioma.
  if (content.includes('UIRef Id="WixUI_InstallDir"')) {
    const welcomePublish =
      '<Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="InstallScopeDlg" Order="2">NOT Installed</Publish>';

    if (!content.includes(welcomePublish)) {
      throw new Error(
        '[msi-project-created] Publish padrão do WelcomeDlg não encontrado; revise o template do electron-builder.'
      );
    }

    content = content.replace(
      welcomePublish,
      '<Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="AppLanguageDlg" Order="2">NOT Installed</Publish>'
    );

    const scopeBack =
      '<Publish Dialog="InstallScopeDlg" Control="Back" Event="NewDialog" Value="WelcomeDlg" Order="1">1</Publish>';

    if (content.includes(scopeBack)) {
      content = content.replace(
        scopeBack,
        '<Publish Dialog="InstallScopeDlg" Control="Back" Event="NewDialog" Value="AppLanguageDlg" Order="1">1</Publish>'
      );
    }

    content = content.replace(
      '</Product>',
      `${buildLanguageDialog()}${buildLocaleDetection()}</Product>`
    );
  } else {
    // Sem UI (instalação silenciosa): grava "auto" para o app detectar o SO.
    content = content.replace(
      '</Product>',
      `<Property Id="${LOCALE_PROPERTY}" Value="auto" Secure="yes" /></Product>`
    );
  }

  // 3) Insere a definição do ComponentGroup antes de </Product>.
  const componentGroup = buildComponentGroup();
  const productEndAfterPatch = content.lastIndexOf('</Product>');
  content =
    content.slice(0, productEndAfterPatch) +
    '\n' +
    componentGroup +
    content.slice(productEndAfterPatch);

  fs.writeFileSync(projectFile, content, 'utf8');
  console.log(
    '[msi-project-created] Registro de associações e seleção de idioma adicionados ao MSI.'
  );
}

// electron-builder carrega o hook esperando um export default (ou module.exports = fn).
module.exports = msiProjectCreated;
module.exports.default = msiProjectCreated;
module.exports.msiProjectCreated = msiProjectCreated;
