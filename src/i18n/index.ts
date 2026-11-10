import type { AppLanguage } from '../../electron/types';
import { en } from './en';
import { fa, type TranslationKeys } from './fa';

export function getTranslations(lang: AppLanguage): TranslationKeys {
  return lang === 'en' ? en : fa;
}

export function formatBytes(bytes: number, isFa: boolean): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return isFa ? '۰ B' : '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  const fixed = val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return `${fixed} ${units[idx]}`;
}

export function formatSpeed(bps: number, isFa: boolean): string {
  return `${formatBytes(bps, isFa)}/s`;
}
