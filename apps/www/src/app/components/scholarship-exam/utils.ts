export function letterForIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveAssetUrl(assetBaseUrl: string | undefined, assetPath: string | null | undefined): string | undefined {
  if (!assetPath) return undefined;
  if (!assetBaseUrl) return assetPath;
  const normalizedBase = assetBaseUrl.endsWith('/') ? assetBaseUrl.slice(0, -1) : assetBaseUrl;
  const normalizedPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  return `${normalizedBase}/${normalizedPath}`;
}
