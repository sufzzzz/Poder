import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { store } from './store';
import { Sidebar } from './ui/Sidebar';
import { Timeline } from './ui/Timeline';
import { Composer } from './ui/Composer';
import { Settings } from './ui/Settings';
import { IconChevron, IconRefresh, IconSettings, IconWrench } from './ui/icons';

const SUGGESTIONS = [
  '看一下这个仓库的结构，用三句话说明它是做什么的',
  '跑一遍测试，把失败的原因讲清楚',
  '解释最近一次改动都动了什么',
  '把 README 里过时的命令更新一下'
];

export function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    store.start();
    (window as any).__enso = store;
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Cmd/Ctrl+K 直接跳到会话搜索，Esc 收起移动端抽屉
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('.search input');
        input?.focus();
        input?.select();
      }
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const settings = route.startsWith('#/settings');
  const entry = state.catalog.find((item) => item.id === state.activeId);
  const view = store.view(state.activeId);
  const running = view.status === 'running' || view.status === 'streaming' || view.status === 'waiting';
  const drafting = Boolean(state.draft);

  if (settings) {
    return (
      <>
        <Settings state={state} onBack={() => { window.location.hash = '#/'; }} />
        {state.toast && <div className="toast">{state.toast}</div>}
      </>
    );
  }

  return (
    <div className="app">
      <div className={sidebarOpen ? 'sidebar-shell open' : 'sidebar-shell'}>
        <Sidebar
          state={state}
          onNew={() => {
            setSidebarOpen(false);
            store.startDraft();
          }}
          onOpen={(id) => {
            store.openSession(id);
            setSidebarOpen(false);
          }}
          onSettings={() => {
            setSidebarOpen(false);
            window.location.hash = '#/settings';
          }}
        />
      </div>
      {sidebarOpen ? <div className="scrim" onClick={() => setSidebarOpen(false)} /> : null}

      <main className="main">
        <ChatHead
          state={state}
          entry={entry}
          usage={view?.usageTotals}
          ctxPct={contextPercent(view)}
          drafting={drafting}
          onMenu={() => setSidebarOpen((v) => !v)}
        />
        {state.activeId ? (
          <>
            <TimelineScroller state={state} view={view} sessionId={state.activeId} />
            <Composer state={state} running={running} />
          </>
        ) : (
          <>
            {state.link === 'replaced' ? <LinkBanner /> : null}
            <DraftHome state={state} />
          </>
        )}
      </main>

      {state.toast && <div className="toast">{state.toast}</div>}
    </div>
  );
}

/** 未选中会话时的落地页：直接可以输入，工作区/模型在输入框里选。 */
function DraftHome({ state }: { state: any }) {
  const draft = state.draft;
  const project = state.projects.find((item: any) => item.id === draft?.projectId);
  return (
    <>
      <div className="draft-scroll">
        <div className="draft-inner">
          {draft ? (
            <div className="draft-head">
              <div className="empty-logo small">E</div>
              <h1>新会话</h1>
              <p>
                在 <b>{project?.name ?? project?.path ?? '默认工作区'}</b> 里开始。
                直接说要做的事，发送后才会创建会话。
              </p>
            </div>
          ) : (
            <div className="draft-head">
              <div className="empty-logo">E</div>
              <h1>今天想让它做什么？</h1>
              <p>
                左侧选择会话继续，或直接在这里输入——它会带着工具在 VPS 的桌面上干活。
              </p>
            </div>
          )}

          <div className="suggestions">
            {SUGGESTIONS.map((text) => (
              <button
                key={text}
                className="suggestion"
                onClick={() => {
                  if (!state.draft) store.startDraft();
                  store.sendDraft(text);
                }}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Composer state={state} running={false} />
    </>
  );
}

function TimelineScroller({ state, view, sessionId }: { state: any; view: any; sessionId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const pendingEarlier = useRef<number | null>(null);
  const lastCount = useRef(view.messages.size);
  const [away, setAway] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const indices = [...view.messages.keys()];
  const minIndex = indices.length ? Math.min(...indices) : 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stick.current = gap < 120;
      setAway(gap > 160);
      if (gap < 160) setFresh(0);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [sessionId]);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [state.rev, sessionId]);

  // 不在底部时累计新消息数，给「回到最新」按钮做未读提示
  useEffect(() => {
    const count = view.messages.size;
    if (count > lastCount.current && !stick.current) {
      setFresh((n) => n + (count - lastCount.current));
    }
    lastCount.current = count;
  }, [view.messages.size]);

  // 加载更早之后，把滚动位置钉回原来那条消息上
  useEffect(() => {
    const el = ref.current;
    if (!el || pendingEarlier.current === null) return;
    const before = pendingEarlier.current;
    pendingEarlier.current = null;
    setLoadingEarlier(false);
    el.scrollTop += el.scrollHeight - before;
  }, [state.rev]);

  const loadEarlier = () => {
    const el = ref.current;
    if (!el || loadingEarlier) return;
    pendingEarlier.current = el.scrollHeight;
    setLoadingEarlier(true);
    store.loadEarlier();
  };

  const toBottom = () => {
    setFresh(0);
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <>
      {state.link === 'replaced' ? <LinkBanner /> : null}
      <div className="timeline-wrap" ref={ref}>
        <div className="timeline">
          {minIndex > 0 && (
            <button className="ux-earlier" type="button" onClick={loadEarlier} disabled={loadingEarlier}>
              {loadingEarlier ? '加载中…' : '加载更早的消息'}
            </button>
          )}
          <Timeline state={state} view={view} sessionId={sessionId} />
        </div>
      </div>
      {away && (
        <button className="ux-jump" type="button" title="回到最新" onClick={toBottom}>
          <IconChevron size={15} />
          {fresh > 0 && <span className="ux-jump-badge">{fresh > 99 ? '99+' : fresh}</span>}
        </button>
      )}
    </>
  );
}

function formatTokens(value?: number): string {
  if (!value || value < 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** 上下文占用百分比：占用结构随版本变过，这里把几种形态都兜住 */
function contextPercent(view: any): number | undefined {
  const occupancy = view?.occupancy;
  if (typeof occupancy === 'number') return occupancy <= 1 ? occupancy * 100 : occupancy;
  if (occupancy && typeof occupancy === 'object') {
    const used = occupancy.used ?? occupancy.usedTokens;
    const window = occupancy.window ?? occupancy.windowTokens ?? occupancy.limit ?? view?.contextWindow;
    if (typeof used === 'number' && typeof window === 'number' && window > 0) return (used / window) * 100;
    if (typeof occupancy.percent === 'number') return occupancy.percent;
  }
  return undefined;
}

/** 顶栏用量徽标的 tooltip：把缓命中、首字延迟、速度一并列出 */
function usageHint(usage: any, ctxPct?: number): string {
  const parts: string[] = [];
  if (typeof ctxPct === 'number') parts.push(`上下文占用 ${Math.round(ctxPct)}%`);
  if (usage) {
    parts.push(`输入 ${usage.inputTokens ?? 0}`, `输出 ${usage.outputTokens ?? 0}`);
    if (typeof usage.cacheHitPercent === 'number') parts.push(`缓存命中 ${Math.round(usage.cacheHitPercent)}%`);
    if (typeof usage.ttftAvgMs === 'number') parts.push(`首字 ${Math.round(usage.ttftAvgMs)}ms`);
    if (typeof usage.tokensPerSecond === 'number') parts.push(`${usage.tokensPerSecond.toFixed(1)} tok/s`);
  }
  return parts.join(' · ');
}

function ChatHead({
  state,
  entry,
  usage,
  ctxPct,
  drafting,
  onMenu
}: {
  state: any;
  entry: any;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheHitPercent?: number;
    ttftAvgMs?: number;
    tokensPerSecond?: number;
  };
  ctxPct?: number;
  drafting: boolean;
  onMenu: () => void;
}) {
  const project = useMemo(
    () => state.projects.find((p: any) => p.id === (drafting ? state.draft?.projectId : entry?.projectId)),
    [state.projects, entry?.projectId, drafting, state.draft?.projectId]
  );
  const running = entry?.status === 'running' || entry?.status === 'streaming';
  const waiting = entry?.status === 'waiting';

  return (
    <header className="chat-head">
      <button className="icon-btn menu-btn" onClick={onMenu} title="会话列表">
        ☰
      </button>
      <div className="chat-head-main">
        <div className="chat-title">
          {drafting ? '新会话' : entry?.title ?? 'EnsoCode'}
          {!drafting && running && <span className="pill running">运行中</span>}
          {!drafting && waiting && <span className="pill waiting">待确认</span>}
        </div>
        <div className="chat-sub">
          {drafting ? (
            <>
              <span className="mono">{project?.path ?? project?.name ?? '默认工作区'}</span>
              <span className="dot" style={{ width: 3, height: 3 }} />
              <span className="mono">{state.draft?.modelId || '选择模型'}</span>
            </>
          ) : entry ? (
            <>
              <span className="mono">{entry.cwd ?? project?.path ?? entry.projectName ?? ''}</span>
              {entry?.modelId && (
                <>
                  <span className="dot" style={{ width: 3, height: 3 }} />
                  <span className="mono">{entry.modelId}</span>
                </>
              )}
            </>
          ) : (
            <span>选择或新建会话</span>
          )}
        </div>
      </div>
      <div className="chat-actions">
        {usage || typeof ctxPct === 'number' ? (
          <span className="chat-usage mono" title={usageHint(usage, ctxPct)}>
            {typeof ctxPct === 'number' && <span>上下文 {Math.round(ctxPct)}%</span>}
            {usage ? <span>↑{formatTokens(usage.inputTokens)}</span> : null}
            {usage ? <span>↓{formatTokens(usage.outputTokens)}</span> : null}
            {usage && typeof usage.cacheHitPercent === 'number' && (
              <span className="chat-usage-cache">缓存 {Math.round(usage.cacheHitPercent)}%</span>
            )}
          </span>
        ) : null}
        {entry && !drafting && (
          <>
            <button className="icon-btn" title="重试上一轮" onClick={() => store.retry()}>
              <IconRefresh size={15} />
            </button>
            <button className="icon-btn" title="压缩上下文" onClick={() => store.compact()}>
              <IconWrench size={15} />
            </button>
          </>
        )}
        <button className="icon-btn" title="设置" onClick={() => { window.location.hash = '#/settings'; }}>
          <IconSettings size={15} />
        </button>
      </div>
    </header>
  );
}

/** 同一台配对设备被别的窗口接管时的提示条 */
function LinkBanner() {
  return (
    <div className="link-banner">
      <span>该设备已在另一个窗口或设备上连接，此处已停止同步。</span>
      <button className="btn" onClick={() => store.reconnect()}>
        重新连接
      </button>
    </div>
  );
}
