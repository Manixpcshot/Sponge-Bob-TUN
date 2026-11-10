#!/usr/bin/env node
/**
 * Downloads official XTLS/Xray-core binary for the target platform
 * into resources/bin/<platform>/xray(.exe) so electron-builder bundles it.
 *
 * Usage:
 *   node scripts/download-xray.mjs --platform win32 --version latest
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    platform: process.platform,
    arch: process.arch,
    version: process.env.XRAY_VERSION || 'latest',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--platform' && argv[i + 1]) args.platform = argv[++i];
    else if (arg === '--arch' && argv[i + 1]) args.arch = argv[++i];
    else if (arg === '--version' && argv[i + 1]) args.version = argv[++i];
  }
  return args;
}

function getAssetName(platform, arch) {
  if (platform === 'win32') {
    return arch === 'arm64' ? 'Xray-windows-arm64-v8a.zip' : 'Xray-windows-64.zip';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'Xray-macos-arm64-v8a.zip' : 'Xray-macos-64.zip';
  }
  return arch === 'arm64' ? 'Xray-linux-arm64-v8a.zip' : 'Xray-linux-64.zip';
}

async function fetchJson(url) {
  const headers = {
    'User-Agent': 'Sponge-Bob-TUN-Builder/1.0',
    Accept: 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API failed (${res.status}) for ${url}`);
  }
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Sponge-Bob-TUN-Builder/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer;
}

function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', targetDir], { stdio: 'inherit' });
  }
}

async function main() {
  const { platform, arch, version } = parseArgs(process.argv.slice(2));
  const assetName = getAssetName(platform, arch);
  const binName = platform === 'win32' ? 'xray.exe' : 'xray';
  const outDir = path.join(rootDir, 'resources', 'bin', platform);
  const binPath = path.join(outDir, binName);

  const apiUrl =
    version === 'latest'
      ? 'https://api.github.com/repos/XTLS/Xray-core/releases/latest'
      : `https://api.github.com/repos/XTLS/Xray-core/releases/tags/${version}`;

  console.log(`[xray:download] Fetching release info from ${apiUrl}...`);
  const release = await fetchJson(apiUrl);
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new Error(`Asset ${assetName} not found in release ${release.tag_name}`);
  }

  const dgstAsset = release.assets.find((a) => a.name === `${assetName}.dgst`);
  const tmpDir = path.join(rootDir, '.tmp-xray');
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, assetName);

  try {
    console.log(`[xray:download] Downloading ${asset.name} (${release.tag_name})...`);
    const buf = await downloadFile(asset.browser_download_url, zipPath);

    if (dgstAsset) {
      const dgstRes = await fetch(dgstAsset.browser_download_url, {
        headers: { 'User-Agent': 'Sponge-Bob-TUN-Builder/1.0' },
      });
      if (dgstRes.ok) {
        const dgstText = await dgstRes.text();
        const sha256Match = dgstText.match(/SHA2-?256\s*=\s*([a-fA-F0-9]{64})/);
        if (sha256Match) {
          const expected = sha256Match[1].toLowerCase();
          const actual = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
          if (actual !== expected) {
            throw new Error(`SHA-256 mismatch for ${assetName}: expected ${expected}, got ${actual}`);
          }
          console.log(`[xray:download] SHA-256 verified: ${actual}`);
        }
      }
    }

    extractZip(zipPath, outDir);

    // Keep xray binary (and optional geo dat files if small/useful, though we avoid depending on them)
    if (!fs.existsSync(binPath)) {
      throw new Error(`Expected extracted binary at ${binPath}`);
    }
    if (platform !== 'win32') {
      fs.chmodSync(binPath, 0o755);
    }

    // Write minimal version metadata
    fs.writeFileSync(
      path.join(outDir, 'xray-version.json'),
      JSON.stringify({ version: release.tag_name, asset: assetName }, null, 2),
    );
    console.log(`[xray:download] Ready at ${binPath} (${release.tag_name})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[xray:download] Error:', err.message);
  process.exit(1);
});
