import { adminApi } from './boot';

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(adminApi(path), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface ProviderView {
  id: string;
  name: string;
  api: string;
  baseUrl: string;
  enabled: boolean;
  hasKey: boolean;
  keyHint: string;
  models: { id: string; enabled: boolean }[];
}

export interface SettingsView {
  providers: ProviderView[];
  fields: Record<string, any>;
  meta: { path: string; mtime: number; defaultModel: string | null };
}

export interface Overview {
  user: string;
  web: { uptime: number; pid: number; node: string };
  desktop: { unit: string; active: boolean; since: string | null; mainPid: string | null };
  device: { pairId: string; deviceName: string; pairedAt: number | null; relayUrl: string; scope: string };
  settings: { path: string; mtime: number; providers: number; models: number; defaultModel: string | null };
  upstream: { ok: boolean; count: number; at: number; error?: string; baseUrl?: string };
}

export const admin = {
  overview: () => call<Overview>('/overview'),
  settings: () => call<SettingsView>('/settings'),
  save: (body: Record<string, unknown>) => call<{ ok: boolean; restarted: boolean }>('/settings', { method: 'POST', body: JSON.stringify(body) }),
  syncModels: (providerId: string, apply: boolean) =>
    call<{ available: string[]; missing: string[]; extra: string[] }>('/models/sync', {
      method: 'POST',
      body: JSON.stringify({ providerId, apply })
    }),
  service: (unit: string, action: string) =>
    call<{ ok: boolean; status: string }>('/service', { method: 'POST', body: JSON.stringify({ unit, action }) }),
  logs: (unit: string, lines = 200) => call<{ unit: string; lines: string }>(`/logs?unit=${encodeURIComponent(unit)}&lines=${lines}`),
  users: (body: Record<string, unknown>) => call<{ users: string[] }>('/users', { method: 'POST', body: JSON.stringify(body) }),
  rotate: () => call<{ ok: boolean }>('/secret/rotate', { method: 'POST' })
};