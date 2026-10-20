import type { CatalogEntry, ProviderEntry } from '@enso/pair';
import {
  applyGuestEvent,
  applyGuestHistory,
  applyGuestSnapshot,
  emptyGuestView,
  type GuestSessionView
} from '@shared/pair/guestProjection';
import { boot } from './boot';
import { PairLink, type LinkState } from './pair/link';

export interface ProjectEntry {
  id: string;
  name?: string;
  path?: string;
}

/** 未落盘的「新会话」草稿：工作区、供应商、模型都还没提交给桌面端。 */
export interface Draft {
  projectId: string;
  providerId: string;
  modelId: string;
  reasoningEnabled: boolean;
  thinkingLevel: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'enso-theme';

export function readThemeMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

/** 把偏好落到 <html data-theme>，system 时读系统配色 */
export function applyThemeMode(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export interface AppState {
  link: LinkState;
  linkDetail?: string;
  host: Record<string, any>;
  catalog: CatalogEntry[];
  /** 置顶会话的手动顺序（host 随目录下发） */
  pinnedOrder: string[];
  /** 主题偏好：用户显式选择优先，否则跟随系统 */
  themeMode: ThemeMode;
  projects: ProjectEntry[];
  providers: ProviderEntry[];
  appearance: Record<string, any>;
  activeId: string | null;
  draft: Draft | null;
  rev: number;
  unread: Record<string, true>;
  toast: string | null;
}

type Listener = () => void;

const VIEW_CACHE = new Map<string, GuestSessionView>();

const CONTEXT_KEY = 'enso-ctx';

interface CachedContext {
  occupancy?: unknown;
  usageTotals?: unknown;
}

function loadContextCache(): Map<string, CachedContext> {
  try {
    const raw = localStorage.getItem(CONTEXT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, CachedContext>) : null;
    return new Map(Object.entries(parsed && typeof parsed === 'object' ? parsed : {}));
  } catch {
    return new Map();
  }
}

/** 上次看到的上下文占用与令牌统计：刷新后先顶一阵，等 host 的 session-meta 到达再更新 */
const CONTEXT_CACHE = loadContextCache();
let contextTimer: ReturnType<typeof setTimeout> | null = null;

function rememberContext(sessionId: string, view: GuestSessionView | undefined): void {
  if (!view) return;
  if (!view.occupancy && !view.usageTotals) return;
  const previous = CONTEXT_CACHE.get(sessionId) ?? {};
  CONTEXT_CACHE.set(sessionId, {
    occupancy: view.occupancy ?? previous.occupancy,
    usageTotals: view.usageTotals ?? previous.usageTotals
  });
  if (contextTimer) return;
  contextTimer = setTimeout(() => {
    contextTimer = null;
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(Object.fromEntries(CONTEXT_CACHE)));
    } catch {
      /* 配额或隐私模式：忽略即可 */
    }
  }, 4000);
}

export class AppStore {
  state: AppState = {
    link: 'idle',
    host: {},
    catalog: [],
    pinnedOrder: [],
    themeMode: readThemeMode() ?? 'system',
    projects: [],
    providers: [],
    appearance: {},
    activeId: null,
    draft: null,
    rev: 0,
    unread: {},
    toast: null
  };

  private listeners = new Set<Listener>();
  private link: PairLink | null = null;
  private lastIndex = new Map<string, number>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): AppState => this.state;

  view(sessionId: string | null): GuestSessionView {
    if (!sessionId) return emptyGuestView();
    const current = VIEW_CACHE.get(sessionId) ?? emptyGuestView();
    if (current.occupancy && current.usageTotals) return current;
    const cached = CONTEXT_CACHE.get(sessionId);
    if (!cached) return current;
    return {
      ...current,
      ...(current.occupancy ? {} : cached.occupancy ? { occupancy: cached.occupancy } : {}),
      ...(current.usageTotals ? {} : cached.usageTotals ? { usageTotals: cached.usageTotals } : {})
    } as GuestSessionView;
  }

  start(): void {
    if (this.link) return;
    const device = boot.device;
    if (!device) {
      this.patch({ link: 'unauthorized', linkDetail: '尚未完成设备配对' });
      return;
    }
    this.link = new PairLink(
      { pairId: device.pairId, token: device.token, contentKey: device.contentKey, relayUrl: device.relayUrl },
      (msg) => this.handle(msg),
      (link, detail) => this.patch({ link, linkDetail: detail })
    );
    this.link.connect();
  }

  reconnect(): void {
    this.link?.disconnect();
    this.link = null;
    this.start();
  }

  private patch(next: Partial<AppState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn();
  }

  private bumpSessions(next: Partial<AppState> = {}): void {
    this.patch({ ...next, rev: this.state.rev + 1 });
  }

  // 宿主刷新 catalog 时，某些会话（尤其是刚切换过模型的）会丢掉 modelId /
  // 思考设置，导致输入框的模型选择掉回「选择模型」。这里按会话记住最后一次
  // 已知值，条目里缺字段时用它兜底；字段存在则以宿主为准。
  private catalogMemo = new Map<string, Partial<CatalogEntry>>();

  private mergeCatalog(entries: CatalogEntry[]): CatalogEntry[] {
    return entries.map((entry) => {
      const memo = this.catalogMemo.get(entry.id) ?? {};
      const next: Partial<CatalogEntry> = { ...memo };
      for (const key of ['providerId', 'modelId', 'reasoningEnabled', 'thinkingLevel'] as const) {
        const value = (entry as any)[key];
        if (value === undefined || value === null || value === '') next[key] = memo[key] as any;
        else next[key] = value;
      }
      this.catalogMemo.set(entry.id, next);
      return { ...entry, ...next } as CatalogEntry;
    });
  }

  private rememberCatalog(sessionId: string, patch: Partial<CatalogEntry>): void {
    this.catalogMemo.set(sessionId, { ...(this.catalogMemo.get(sessionId) ?? {}), ...patch });
    const catalog = this.state.catalog.map((entry) =>
      entry.id === sessionId ? ({ ...entry, ...patch } as CatalogEntry) : entry,
    );
    this.patch({ catalog });
  }

  toast(text: string): void {
    this.patch({ toast: text });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.patch({ toast: null }), 4200);
  }

  // ------------------------------------------------------------------ draft
  // 新建会话不再弹对话框：先进入「草稿」状态，工作区/模型在输入框里选，
  // 第一条消息发出时才真正创建会话（与 Memoh 的 draft chat 一致）。

  private pendingPrompts = new Map<string, { text: string; images?: { data: string; mimeType: string }[] }>();

  private loadDraftPrefs(): Partial<Draft> {
    try {
      return JSON.parse(localStorage.getItem('enso.web.draft') ?? '{}') as Partial<Draft>;
    } catch {
      return {};
    }
  }

  private saveDraftPrefs(draft: Draft): void {
    try {
      localStorage.setItem('enso.web.draft', JSON.stringify(draft));
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  private resolveDraft(input?: Partial<Draft>): Draft {
    const saved: Partial<Draft> = { ...this.loadDraftPrefs(), ...(input ?? {}) };
    const projects = this.state.projects;
    const providers = this.state.providers.filter((p: any) => p.enabled !== false);
    const provider =
      providers.find((p: any) => p.id === saved.providerId) ?? providers[0];
    const models = modelIdsOf(provider);
    return {
      projectId: projects.some((p) => p.id === saved.projectId)
        ? (saved.projectId as string)
        : (projects[0]?.id ?? ''),
      providerId: provider?.id ?? '',
      modelId: models.includes(saved.modelId ?? '') ? (saved.modelId as string) : (models[0] ?? ''),
      reasoningEnabled: saved.reasoningEnabled ?? true,
      thinkingLevel: saved.thinkingLevel ?? 'high'
    };
  }

  /** 进入草稿（重复点击只回到同一个草稿）。 */
  startDraft(patch?: Partial<Draft>): void {
    const draft = this.resolveDraft({ ...(this.state.draft ?? {}), ...(patch ?? {}) });
    this.patch({ draft, activeId: null });
    this.link?.send({ type: 'subscribe', sessionId: null });
  }

  /** 只读预览：落地页还没进入草稿时，输入框也要显示「将要用」的工作区与模型。 */
  peekDraft(): Draft {
    return this.state.draft ?? this.resolveDraft();
  }

  updateDraft(patch: Partial<Draft>): void {
    const base = this.state.draft ?? this.resolveDraft();
    const next: Draft = { ...base, ...patch };
    if (patch.providerId && patch.providerId !== base.providerId && !patch.modelId) {
      const provider = this.state.providers.find((p: any) => p.id === patch.providerId);
      next.modelId = modelIdsOf(provider)[0] ?? '';
    }
    this.patch({ draft: next });
    this.saveDraftPrefs(next);
  }

  discardDraft(): void {
    if (this.state.draft) this.patch({ draft: null });
  }

  /** 列表/供应商晚到时补齐草稿里空着的字段，不覆盖用户已选的值。 */
  private syncDraft(): void {
    const draft = this.state.draft;
    if (!draft) return;
    const next = this.resolveDraft(draft);
    if (
      next.projectId !== draft.projectId ||
      next.providerId !== draft.providerId ||
      next.modelId !== draft.modelId
    ) {
      this.patch({ draft: next });
    }
  }

  /** 草稿发出第一条消息：创建会话 → 等桌面端确认 → 再投递这条消息。 */
  sendDraft(text: string, images?: { data: string; mimeType: string }[]): void {
    const draft = this.state.draft;
    const body = text.trim();
    if (!draft || !body) return;
    if (!draft.projectId || !draft.providerId || !draft.modelId) {
      this.toast('请先选择工作区与模型');
      return;
    }
    this.saveDraftPrefs(draft);
    const sessionId = this.createSession(draft.projectId, draft.providerId, draft.modelId, {
      reasoningEnabled: draft.reasoningEnabled,
      thinkingLevel: draft.thinkingLevel
    });
    if (!sessionId) return;
    this.patch({ draft: null });
    this.pendingPrompts.set(sessionId, { text: body, images: images?.length ? images : undefined });
    this.flushPending();
    setTimeout(() => this.flushPending(true), 2500);
  }

  private flushPending(force = false): void {
    if (!this.pendingPrompts.size) return;
    for (const [sessionId, pending] of [...this.pendingPrompts]) {
      const exists = this.state.catalog.some((entry) => entry.id === sessionId);
      if (!exists && !force) continue;
      this.pendingPrompts.delete(sessionId);
      this.link?.send({
        type: 'prompt',
        sessionId,
        text: pending.text,
        ...(pending.images?.length ? { images: pending.images } : {})
      });
    }
  }

  // ---------------------------------------------------------------- messages

  private handle(msg: Record<string, any>): void {
    switch (msg.type) {
      case 'catalog':
        this.patch({
          catalog: this.mergeCatalog((msg.entries ?? []) as CatalogEntry[]),
          pinnedOrder: Array.isArray(msg.pinnedOrder)
            ? (msg.pinnedOrder as string[])
            : this.state.pinnedOrder
        });
        this.flushPending();
        break;
      case 'projects':
        this.patch({ projects: (msg.projects ?? []) as ProjectEntry[] });
        this.syncDraft();
        break;
      case 'providers':
        this.patch({ providers: (msg.providers ?? []) as ProviderEntry[] });
        this.syncDraft();
        break;
      case 'host-info':
        this.patch({ host: msg.info ?? msg });
        break;
      case 'appearance':
        this.patch({ appearance: msg.appearance ?? {} });
        break;
      case 'session-sync':
        this.applySync(msg);
        break;
      case 'agent-event':
        // 中继只推当前订阅会话的事件，事件帧本身不带 sessionId
        if (this.state.activeId) this.applyEvent(this.state.activeId, msg.event, msg.cursor);
        break;
      case 'history':
        this.applyHistory(msg);
        break;
      case 'command-rejected':
        this.toast(`操作被拒绝：${msg.reason ?? msg.code ?? '未知原因'}`);
        break;
      default:
        break;
    }
  }

  private applySync(msg: Record<string, any>): void {
    if (msg.mode === 'replay') {
      const current = VIEW_CACHE.get(msg.sessionId) ?? emptyGuestView();
      let view = current;
      for (const event of msg.events ?? []) {
        const result = applyGuestEvent(view, event);
        view = result.view;
        if (typeof result.lastIndex === 'number') this.lastIndex.set(msg.sessionId, result.lastIndex);
      }
      VIEW_CACHE.set(msg.sessionId, view);
      this.bumpSessions();
      return;
    }

    // 宿主回的是 { type:'snapshot', sessions:[...] } 包一层
    const payload = msg.snapshot ?? msg.session ?? null;
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : payload ? [payload] : [];
    const results = applyGuestSnapshot(VIEW_CACHE, { sessions });
    for (const result of results) {
      VIEW_CACHE.set(result.id, result.view);
      if (typeof result.lastIndex === 'number') this.lastIndex.set(result.id, result.lastIndex);
      rememberContext(result.id, result.view);
    }
    this.bumpSessions();
  }

  private applyEvent(sessionId: string, event: Record<string, any>, cursor?: any): void {
    if (!sessionId || !event) return;
    // 按 sinceIndex 增量订阅时，宿主对冷会话/换代仍可能回整份快照事件；
    // 这类事件要按快照合并，当增量丢掉会让已打开的会话停在旧内容上。
    if (event.type === 'snapshot') {
      const sessions = Array.isArray(event.sessions) ? event.sessions : [];
      if (!sessions.length) return;
      for (const applied of applyGuestSnapshot(VIEW_CACHE, { sessions })) {
        VIEW_CACHE.set(applied.id, applied.view);
        if (typeof applied.lastIndex === 'number') this.lastIndex.set(applied.id, applied.lastIndex);
        rememberContext(applied.id, applied.view);
      }
      this.bumpSessions();
      return;
    }
    const current = VIEW_CACHE.get(sessionId);
    if (!current) return;
    const result = applyGuestEvent(current, event);
    VIEW_CACHE.set(sessionId, result.view);
    rememberContext(sessionId, result.view);
    if (typeof result.lastIndex === 'number') this.lastIndex.set(sessionId, result.lastIndex);
    const unread = sessionId === this.state.activeId ? this.state.unread : { ...this.state.unread, [sessionId]: true as const };
    this.bumpSessions({ unread });
    void cursor;
  }

  private applyHistory(msg: Record<string, any>): void {
    const current = VIEW_CACHE.get(msg.sessionId);
    if (!current) return;
    const next = applyGuestHistory(current, { baseIndex: msg.baseIndex ?? 0, messages: msg.messages ?? [] });
    VIEW_CACHE.set(msg.sessionId, next);
    this.bumpSessions();
  }

  // ---------------------------------------------------------------- commands

  // 会话管理：三条命令都由桌面端执行，成功后 host 会推新的目录回来
  renameSession(sessionId: string, title: string): void {
    const next = title.trim();
    if (!sessionId || !next) return;
    this.link?.send({ type: 'session-rename', sessionId, title: next.slice(0, 120) });
  }

  setSessionPinned(sessionId: string, pinned: boolean): void {
    if (!sessionId) return;
    this.link?.send({ type: 'session-pin', sessionId, pinned });
  }

  setTheme(mode: ThemeMode): void {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* 隐私模式下写入失败也无妨，本次生效即可 */
    }
    applyThemeMode(mode);
    this.patch({ themeMode: mode });
  }

  removeSession(sessionId: string): void {
    if (!sessionId) return;
    this.link?.send({ type: 'session-remove', sessionId });
  }

  openSession(sessionId: string): void {
    const unread = { ...this.state.unread };
    delete unread[sessionId];
    this.patch({ activeId: sessionId, unread, draft: null });
    if (!VIEW_CACHE.has(sessionId)) VIEW_CACHE.set(sessionId, emptyGuestView());
    const sinceIndex = this.lastIndex.get(sessionId);
    if (typeof sinceIndex === 'number' && VIEW_CACHE.get(sessionId)?.messages.size) {
      this.link?.send({ type: 'subscribe', sessionId, sinceIndex });
    } else {
      // 没有基线时显式要一份快照，否则宿主不会回 session-sync
      this.link?.send({ type: 'subscribe', sessionId, sync: { requestId: `sync-${Date.now().toString(36)}` } });
    }
  }

  closeSession(): void {
    this.link?.send({ type: 'subscribe', sessionId: null });
    this.patch({ activeId: null });
  }

  prompt(text: string, running: boolean, images?: { data: string; mimeType: string }[]): void {
    const sessionId = this.state.activeId;
    if (!sessionId || !text.trim()) return;
    this.link?.send({
      type: running ? 'enqueue' : 'prompt',
      sessionId,
      text,
      ...(images?.length ? { images } : {})
    });
  }

  steer(text: string): void {
    const sessionId = this.state.activeId;
    if (!sessionId || !text.trim()) return;
    this.link?.send({ type: 'steer', sessionId, text });
  }

  abort(): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'abort', sessionId });
  }

  retry(): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'retry', sessionId });
  }

  rewind(userIndexFromEnd: number): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'rewind', sessionId, userIndexFromEnd });
  }

  compact(): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'compact', sessionId });
  }

  approve(requestId: string, decision: string): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'approval-respond', sessionId, requestId, decision });
  }

  answer(requestId: string, answer: string): void {
    const sessionId = this.state.activeId;
    if (sessionId) this.link?.send({ type: 'ask-respond', sessionId, requestId, answer });
  }

  setModel(providerId: string, modelId: string): void {
    const sessionId = this.state.activeId;
    if (!sessionId) return;
    this.rememberCatalog(sessionId, { providerId, modelId });
    this.link?.send({ type: 'set-model', sessionId, providerId, modelId });
  }

  setReasoning(enabled: boolean): void {
    const sessionId = this.state.activeId;
    if (!sessionId) return;
    this.rememberCatalog(sessionId, { reasoningEnabled: enabled });
    this.link?.send({ type: 'set-reasoning', sessionId, enabled });
  }

  setThinking(level: string): void {
    const sessionId = this.state.activeId;
    if (!sessionId) return;
    this.rememberCatalog(sessionId, { thinkingLevel: level });
    this.link?.send({ type: 'set-thinking', sessionId, level });
  }

  loadEarlier(): void {
    const sessionId = this.state.activeId;
    if (!sessionId) return;
    const view = this.view(sessionId);
    const indices = [...view.messages.keys()];
    if (!indices.length) return;
    this.link?.send({ type: 'history', sessionId, beforeIndex: Math.min(...indices) });
  }

  createSession(projectId: string, providerId: string, modelId: string, options: Record<string, unknown> = {}): string | null {
    const sessionId = `web-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`).replace(/-/g, '')}`;
    this.link?.send({ type: 'spawn', sessionId, projectId, providerId, modelId, ...options });
    this.openSession(sessionId);
    return sessionId;
  }
}

export const store = new AppStore();

/** 供应商下可用的模型 id 列表（宿主可能给字符串或 {id} 对象）。 */
export function modelIdsOf(provider?: ProviderEntry | null): string[] {
  const list = ((provider?.models ?? []) as Array<string | { id?: string }>) ?? [];
  return list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id ?? ''))
    .filter((id): id is string => Boolean(id));
}
