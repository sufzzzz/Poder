export interface DeviceBoot {
  pairId: string;
  token: string;
  contentKey: string;
  relayUrl: string;
  deviceName?: string;
}

export interface Boot {
  user: string;
  device: DeviceBoot | null;
  base: string;
  host?: string;
}

const fallback: Boot = { user: '', device: null, base: '/enso' };

export const boot: Boot = { ...fallback, ...((window as any).__ENSO_BOOT__ ?? {}) };
export const base = boot.base || '/enso';
export const adminApi = (path: string): string => `${base}/api/admin${path}`;