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

const rawBoot = typeof window !== 'undefined' ? (window as any).__ENSO_BOOT__ : undefined;
export const boot: Boot = { ...fallback, ...(rawBoot ?? {}) };
export const base = boot.base || '/enso';
export const adminApi = (path: string): string => `${base}/api/admin${path}`;