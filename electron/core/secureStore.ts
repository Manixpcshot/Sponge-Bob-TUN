import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, ServerSecretRecord, SubscriptionUserInfo } from '../types';
import { registerSecret, registerSecretsFromServers } from './logSanitizer';

export interface VaultState {
  subscriptionUrl: string;
  servers: ServerSecretRecord[];
  pinnedIds: string[];
  selectedServerId: string | null;
  userInfo: SubscriptionUserInfo | null;
  settings: AppSettings;
}

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'fa',
  theme: 'obsidian',
  socksPort: 10808,
  httpPort: 10809,
  enableSystemProxy: true,
  bypassLan: true,
  autoBestServer: true,
  latencyCheckIntervalSec: 45,
  healthCheckIntervalSec: 15,
  fallbackFailureThreshold: 3,
  autoUpdateOnLaunch: true,
  autoInstallUpdateOnLaunch: true,
  minimizeToTrayOnClose: true,
  customSpongeMascotDataUrl: null,
  customCrabMascotDataUrl: null,
};

export function createDefaultVaultState(): VaultState {
  return {
    subscriptionUrl: '',
    servers: [],
    pinnedIds: [],
    selectedServerId: null,
    userInfo: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

interface EncryptedVaultFile {
  version: 1;
  mode: 'safeStorage' | 'aes-256-gcm';
  iv?: string;
  tag?: string;
  payload: string;
}

export class SecureVaultStore {
  private readonly vaultPath: string;
  private readonly keyPath: string;
  private readonly safeStorage?: SafeStorageAdapter;

  constructor(userDataDir: string, safeStorage?: SafeStorageAdapter) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.vaultPath = path.join(userDataDir, 'vault.sbx');
    this.keyPath = path.join(userDataDir, '.vault.key');
    this.safeStorage = safeStorage;
  }

  private getOrCreateFallbackKey(): Buffer {
    if (fs.existsSync(this.keyPath)) {
      const hex = fs.readFileSync(this.keyPath, 'utf8').trim();
      const buf = Buffer.from(hex, 'hex');
      if (buf.length === 32) return buf;
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  load(): VaultState {
    const defaults = createDefaultVaultState();
    if (!fs.existsSync(this.vaultPath)) {
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.vaultPath, 'utf8');
      const envelope = JSON.parse(raw) as EncryptedVaultFile;
      let plainJson = '';

      if (envelope.mode === 'safeStorage') {
        if (!this.safeStorage?.isEncryptionAvailable()) {
          return defaults;
        }
        plainJson = this.safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'));
      } else if (envelope.mode === 'aes-256-gcm') {
        if (!envelope.iv || !envelope.tag) return defaults;
        const key = this.getOrCreateFallbackKey();
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(envelope.iv, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
        plainJson = Buffer.concat([
          decipher.update(Buffer.from(envelope.payload, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } else {
        return defaults;
      }

      const parsed = JSON.parse(plainJson) as Partial<VaultState>;
      const merged: VaultState = {
        subscriptionUrl: typeof parsed.subscriptionUrl === 'string' ? parsed.subscriptionUrl : '',
        servers: Array.isArray(parsed.servers) ? parsed.servers : [],
        pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds : [],
        selectedServerId: typeof parsed.selectedServerId === 'string' ? parsed.selectedServerId : null,
        userInfo: parsed.userInfo ?? null,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
        },
      };

      // Immediately register secrets with logSanitizer
      if (merged.subscriptionUrl) registerSecret(merged.subscriptionUrl);
      if (merged.servers.length > 0) registerSecretsFromServers(merged.servers);

      return merged;
    } catch {
      return defaults;
    }
  }

  save(state: VaultState): void {
    if (state.subscriptionUrl) registerSecret(state.subscriptionUrl);
    if (state.servers.length > 0) registerSecretsFromServers(state.servers);

    const json = JSON.stringify(state);
    let fileObj: EncryptedVaultFile;

    if (this.safeStorage?.isEncryptionAvailable()) {
      const encrypted = this.safeStorage.encryptString(json);
      fileObj = {
        version: 1,
        mode: 'safeStorage',
        payload: encrypted.toString('base64'),
      };
    } else {
      const key = this.getOrCreateFallbackKey();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      fileObj = {
        version: 1,
        mode: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        payload: encrypted.toString('base64'),
      };
    }

    const tmpPath = `${this.vaultPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(fileObj), { mode: 0o600 });
    fs.renameSync(tmpPath, this.vaultPath);
  }
}
