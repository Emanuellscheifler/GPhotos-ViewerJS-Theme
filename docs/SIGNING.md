# Assinatura do MSI

**Status atual: aguardando aprovação da candidatura ao
[SignPath Foundation](https://signpath.org/).** Enquanto isso, o MSI gerado por
`npm run dist` não é assinado e não há Release público.

## Por que assinar

- O Windows exibe o nome do publicador no UAC/SmartScreen em vez de "editor desconhecido".
- O Windows Installer valida a assinatura do MSI; o SmartScreen/Defender valida a do
  executável do aplicativo.
- Assinaturas com timestamp continuam válidas depois que o certificado expira.

Assinar **não garante** a remoção imediata do aviso do SmartScreen. Certificados OV
(como o do SignPath) ganham reputação com o tempo e com downloads. Apenas certificados
EV têm confiança imediata, e não são oferecidos pelo SignPath.

## Caminho escolhido: SignPath Foundation (gratuito para OSS)

1. Candidatura em https://signpath.org/ com a URL do repositório público, licença MIT e
   descrição do processo de build.
2. Após aprovação, instalar o **SignPath GitHub App** no repositório.
3. Guardar o token de API em **Settings → Secrets and variables → Actions**:
   - `SIGNPATH_API_TOKEN`
4. Configurar as variáveis do repositório fornecidas pelo SignPath:
   - `SIGNPATH_ORGANIZATION_ID`
   - `SIGNPATH_PROJECT_SLUG`
   - `SIGNPATH_SIGNING_POLICY_SLUG`
   - `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

## Fluxo de release planejado

O executável precisa estar assinado **antes** de ser embutido no MSI. O fluxo previsto
para tags `v*`:

1. `npm ci`
2. `electron-builder --win dir` gera `dist/win-unpacked`
3. O `Visualizador de Fotos.exe` é enviado ao SignPath e substituído pelo assinado
4. `electron-builder --win msi --prepackaged dist/win-unpacked` gera o MSI com o exe já
   assinado
5. O MSI é enviado ao SignPath e substituído pelo assinado
6. `SHA256SUMS.txt` é gerado
7. O Release é criado com o MSI assinado e o checksum

Enquanto a aprovação não sai, o workflow
[`.github/workflows/build.yml`](../.github/workflows/build.yml) apenas compila o MSI
sem assinatura e o disponibiliza como artefato do Actions.

## Alternativa manual (certificado próprio)

Com um `.pfx` (ou certificado na loja do Windows, como o Certum SimplySign):

```powershell
$env:CSC_LINK = "C:\certs\codesign.pfx"
$env:CSC_KEY_PASSWORD = "senha"
npm run dist
```

O electron-builder assina o `.exe` durante o empacotamento e o `.msi` no final. Para
certificado na loja, use `signtool` com o thumbprint:

```powershell
signtool sign /sha1 <THUMBPRINT> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "Visualizador de Fotos.exe"
signtool sign /sha1 <THUMBPRINT> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "Visualizador-de-Fotos-1.0.2-x64.msi"
```

Verificação:

```powershell
Get-AuthenticodeSignature "dist\Visualizador-de-Fotos-1.0.2-x64.msi"
signtool verify /pa /v "dist\Visualizador-de-Fotos-1.0.2-x64.msi"
```

## Segurança

- Nunca comite `.pfx`, `.p12`, senhas ou tokens.
- Use GitHub Secrets para o token do SignPath.
- O `.gitignore` já bloqueia certificados e arquivos `.env`.

