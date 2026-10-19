import { useMemo, useState } from 'react';
import { base, boot } from '../boot';
import type { AppState } from '../store';
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

  const groups = useMemo(() => {
    const entries = [...state.catalog]
      .filter((e) => !query || (e.title ?? '').toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const buckets = new Map<string, typeof entries>();
    for (const entry of entries) {
      const label = groupLabel(entry.updatedAt ?? 0);
      const list = buckets.get(label) ?? [];
      list.push(entry);
      buckets.set(label, list);
    }
    const order = ['今天', '昨天', '本周', '更早'];
    return order.filter((k) => buckets.has(k)).map((k) => ({ label: k, items: buckets.get(k)! }));
  }, [state.catalog, query]);

  const conn = state.link;
  const connLabel =
    conn === 'online' ? '已连接' : conn === 'connecting' ? '连接中' : conn === 'reconnecting' ? '重连中' : conn === 'replaced' ? '已在别处连接' : conn === 'unauthorized' ? '凭据失效' : conn === 'offline' ? '已断开' : '未连接';
  const connDot = conn === 'online' ? 'dot running' : conn === 'unauthorized' ? 'dot error' : 'dot waiting';

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div className="brand-name">EnsoCode</div>
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
              return (
                <div key={entry.id} className={`session-item${active ? ' active' : ''}`} onClick={() => onOpen(entry.id)}>
                  <div className="session-row">
                    <span className={unread ? 'dot unread' : statusClass(entry.status)} />
                    <span className="session-title">{entry.title || '未命名会话'}</span>
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
        <a className="icon-btn" title="退出登录" href={`${base}/logout`}>
          <IconLogout size={15} />
        </a>
      </div>
    </aside>
  );
}
