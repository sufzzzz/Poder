import { useMemo, useState } from 'react';
import { base, boot } from '../boot';
import { store, type AppState } from '../store';
import { IconLogout, IconPlus, IconSearch, IconSettings } from './icons';

const dayMs = 86400000;

function groupLabel(ts: number): string {
  if (!ts) return '更早';
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return '今天';
  if (ts >= startOfToday - dayMs) return '昨天';
  if (ts >= now - 7 * dayMs) return '本周';
  return '更早';
}

function relTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < dayMs) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const statusClass = (status?: string): string => {
  switch (status) {
    case 'running':
    case 'streaming':
      return 'dot running';
    case 'waiting':
    case 'approval':
      return 'dot waiting';
    case 'error':
    case 'failed':
      return 'dot error';
    default:
      return 'dot';
  }
};

export function Sidebar(props: {
  state: AppState;
  onNew: () => void;
  onOpen: (id: string) => void;
  onSettings: () => void;
}) {
  const { state, onNew, onOpen, onSettings } = props;
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const groups = useMemo(() => {
    const entries = [...state.catalog].filter(
      (e) => !query || (e.title ?? '').toLowerCase().includes(query.toLowerCase())
    );
    // 置顶会话单独一组；顺序优先用 host 的 pinnedOrder，没有就按更新时间
    const pinned = entries
      .filter((e) => e.pinned === true)
      .sort((a, b) => {
        const ia = state.pinnedOrder.indexOf(a.id);
        const ib = state.pinnedOrder.indexOf(b.id);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
    const rest = entries
      .filter((e) => e.pinned !== true)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const buckets = new Map<string, typeof rest>();
    for (const entry of rest) {
      const label = groupLabel(entry.updatedAt ?? 0);
      const list = buckets.get(label) ?? [];
      list.push(entry);
      buckets.set(label, list);
    }
    const order = ['今天', '昨天', '本周', '更早'];
    const bucketsOut = order.filter((k) => buckets.has(k)).map((k) => ({ label: k, items: buckets.get(k)! }));
    return pinned.length > 0 ? [{ label: '置顶', items: pinned }, ...bucketsOut] : bucketsOut;
  }, [state.catalog, state.pinnedOrder, query]);

  const conn = state.link;
  const connLabel =
    conn === 'online' ? '已连接' : conn === 'connecting' ? '连接中' : conn === 'reconnecting' ? '重连中' : conn === 'replaced' ? '已在别处连接' : conn === 'unauthorized' ? '凭据失效' : conn === 'offline' ? '已断开' : '未连接';
  const connDot = conn === 'online' ? 'dot running' : conn === 'unauthorized' ? 'dot error' : 'dot waiting';

  const themeMode = state.themeMode;
  const themeName = themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统';
  const themeGlyph = themeMode === 'light' ? '☀' : themeMode === 'dark' ? '☾' : '◐';
  const cycleTheme = () => {
    const next = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
    store.setTheme(next);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div className="brand-name">Poder</div>
          <button className="icon-btn" title="设置" onClick={onSettings}>
            <IconSettings size={15} />
          </button>
        </div>

        <button className={`new-session${state.draft ? ' active' : ''}`} onClick={onNew}>
          <IconPlus size={15} />
          新建会话
        </button>

        <label className="search">
          <IconSearch size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索会话" />
        </label>
      </div>

      <div className="session-scroll">
        {state.draft && (
          <div className="session-item draft active">
            <div className="session-row">
              <span className="dot waiting" />
              <span className="session-title">新会话</span>
              <span className="draft-tag">草稿</span>
            </div>
            <div className="session-meta">
              <span>{state.draft.modelId || '未选模型'}</span>
            </div>
          </div>
        )}
        {groups.length === 0 && (
          <div style={{ padding: '18px 10px', color: 'var(--muted)', fontSize: 12.5 }}>
            {state.link === 'online' ? '还没有会话，点上方新建一个。' : '正在连接桌面端…'}
          </div>
        )}
        {groups.map((group) => (
          <div className="session-group" key={group.label}>
            <div className="session-group-title">{group.label}</div>
            {group.items.map((entry) => {
              const active = entry.id === state.activeId;
              const unread = state.unread[entry.id] && !active;
              const pinned = entry.pinned === true;
              return (
                <div
                  key={entry.id}
                  className={`session-item${active ? ' active' : ''}`}
                  onClick={() => {
                    if (renamingId !== entry.id) onOpen(entry.id);
                  }}
                >
                  <div className="session-row">
                    <span className={unread ? 'dot unread' : statusClass(entry.status)} />
                    {renamingId === entry.id ? (
                      <input
                        className="session-rename"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            store.renameSession(entry.id, renameValue);
                            setRenamingId(null);
                          } else if (e.key === 'Escape') {
                            setRenamingId(null);
                          }
                        }}
                        onBlur={() => setRenamingId(null)}
                      />
                    ) : (
                      <span className="session-title">{entry.title || '未命名会话'}</span>
                    )}
                    {pinned && <span className="pin-tag">置顶</span>}
                    <button
                      className="session-more"
                      title="更多操作"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(menuId === entry.id ? null : entry.id);
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                  <div className="session-meta">
                    <span>{relTime(entry.updatedAt ?? 0)}</span>
                    {entry.modelId && (
                      <>
                        <span className="dot" style={{ width: 3, height: 3 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.modelId}</span>
                      </>
                    )}
                  </div>
                  {menuId === entry.id && (
                    <div className="session-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setMenuId(null);
                          setRenameValue(entry.title ?? '');
                          setRenamingId(entry.id);
                        }}
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => {
                          setMenuId(null);
                          store.setSessionPinned(entry.id, !pinned);
                        }}
                      >
                        {pinned ? '取消置顶' : '置顶'}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setMenuId(null);
                          const name = entry.title || '未命名会话';
                          if (window.confirm(`删除会话「${name}」？该操作不可撤销。`)) {
                            store.removeSession(entry.id);
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <span className="conn">
          <span className={connDot} />
          <span className="conn-label">{connLabel}</span>
        </span>
        <span className="spacer" />
        <span className="user-chip">{boot.user || String(state.host?.userName ?? '')}</span>
        <button className="icon-btn theme-btn" title={`主题：${themeName}（点击切换）`} onClick={cycleTheme}>
          {themeGlyph}
        </button>
        <a className="icon-btn" title="退出登录" href={`${base}/logout`}>
          <IconLogout size={15} />
        </a>
      </div>
    </aside>
  );
}
