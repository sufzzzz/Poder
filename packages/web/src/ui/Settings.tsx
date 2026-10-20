import { useEffect, useMemo, useState } from 'react';
import type { AppState } from '../store';
import { admin, type Overview, type ProviderView, type SettingsView } from '../api';
import { IconBack, IconChip, IconRefresh, IconServer, IconShield, IconUser, IconWrench } from './icons';

type Tab = 'overview' | 'models' | 'chat' | 'ui' | 'account' | 'maintenance';

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'overview', label: '概览', icon: IconServer },
  { id: 'models', label: '模型与供应商', icon: IconChip },
  { id: 'chat', label: '会话默认', icon: IconWrench },
  { id: 'ui', label: '界面与行为', icon: IconSparkIcon },
  { id: 'account', label: '账号与安全', icon: IconUser },
  { id: 'maintenance', label: '维护', icon: IconShield }
];

function IconSparkIcon({ size = 16 }: { size?: number }) {
  return <IconChip size={size} />;
}

function defaultKeyOf(fields: Record<string, any>): string {
  const value = fields.defaultModel;
  return value && value.providerId && value.modelId ? `${value.providerId}|${value.modelId}` : '';
}

function modelOptionValue(providerId: string, id: string): string {
  return `${providerId}|${id}`;
}

function parseModelValue(value: string): { providerId: string; modelId: string } | null {
  if (!value) return null;
  const index = value.indexOf('|');
  if (index < 0) return null;
  return { providerId: value.slice(0, index), modelId: value.slice(index + 1) };
}

function Row(props: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <b>{props.title}</b>
        {props.hint && <span>{props.hint}</span>}
      </div>
      <div className="field-control">{props.children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return <button className={`switch${value ? ' on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} />;
}

export function Settings({ state, onBack }: { state: AppState; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [fields, setFields] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [nextOverview, nextSettings] = await Promise.all([admin.overview(), admin.settings()]);
      setOverview(nextOverview);
      setSettings(nextSettings);
      setProviders(nextSettings.providers);
      setFields(nextSettings.fields);
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const allModels = useMemo(() => {
    const list: { providerId: string; id: string }[] = [];
    for (const provider of providers) for (const model of provider.models) if (model.enabled) list.push({ providerId: provider.id, id: model.id });
    return list;
  }, [providers]);

  const patchField = (key: string, value: unknown) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const patchProvider = (id: string, patch: Partial<ProviderView>) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setDirty(true);
  };

  const save = async (restart: boolean) => {
    setBusy('save');
    setNote(null);
    try {
      const payload = {
        fields,
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          api: p.api,
          baseUrl: p.baseUrl,
          enabled: p.enabled,
          apiKey: (p as any).apiKeyInput || undefined,
          models: p.models
        })),
        restart
      };
      await admin.save(payload);
      setNote(restart ? '已保存并重启桌面端，几秒后生效。' : '已写入配置文件（桌面端重启后生效）。');
      setDirty(false);
      await reload();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings">
      <nav className="settings-nav">
        <div className="settings-nav-title">Poder 设置</div>
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
        <div className="settings-nav-spacer" />
        <button className="nav-item nav-back" onClick={onBack}>
          <IconBack size={15} /> 返回会话
        </button>
      </nav>

      <div className="settings-body">
        <div className="settings-inner">
          {error && <div className="error-line" style={{ marginBottom: 16 }}>{error}</div>}
          {note && <div className="pill running" style={{ marginBottom: 16, display: 'inline-flex' }}>{note}</div>}

          {tab === 'overview' && <OverviewTab overview={overview} state={state} onReload={reload} />}
          {tab === 'models' && (
            <ModelsTab
              providers={providers}
              allModels={allModels}
              fields={fields}
              onPatchProvider={patchProvider}
              onPatchField={patchField}
              onProviders={setProviders}
              onDirty={() => setDirty(true)}
            />
          )}
          {tab === 'chat' && <ChatDefaults fields={fields} onPatch={patchField} allModels={allModels} />}
          {tab === 'ui' && <UiTab fields={fields} onPatch={patchField} />}
          {tab === 'account' && <AccountTab overview={overview} onReload={reload} />}
          {tab === 'maintenance' && <MaintenanceTab overview={overview} onReload={reload} />}

          {(tab === 'models' || tab === 'chat' || tab === 'ui') && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
              <button className="btn primary" disabled={!dirty || busy === 'save'} onClick={() => void save(true)}>
                {busy === 'save' ? '保存中…' : '保存并重启桌面端'}
              </button>
              <button className="btn" disabled={!dirty || busy === 'save'} onClick={() => void save(false)}>
                仅写入配置
              </button>
              {dirty && <span style={{ color: 'var(--muted)', fontSize: 12 }}>有未保存的修改</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ overview, state, onReload }: { overview: Overview | null; state: AppState; onReload: () => void }) {
  if (!overview) return <div className="card">加载中…</div>;
  const conn = state.link === 'online' ? '在线' : state.link === 'connecting' || state.link === 'reconnecting' ? '连接中' : state.link === 'unauthorized' ? '凭据失效' : '离线';
  return (
    <>
      <h1>概览</h1>
      <p className="lead">这台 VPS 上的 Poder 桌面端与网关状态。</p>

      <div className="card">
        <h2>连接</h2>
        <p className="card-sub">浏览器经官方中继连回桌面端，消息端到端加密。</p>
        <dl className="kv">
          <dt>中继状态</dt>
          <dd>{conn}</dd>
          <dt>桌面端</dt>
          <dd>{overview.desktop.active ? `运行中${overview.desktop.since ? `（自 ${overview.desktop.since}）` : ''}` : '未运行'}</dd>
          <dt>设备名</dt>
          <dd>{overview.device.deviceName || '—'}</dd>
          <dt>配对时间</dt>
          <dd>{overview.device.pairedAt ? new Date(overview.device.pairedAt).toLocaleString('zh-CN') : '—'}</dd>
          <dt>中继地址</dt>
          <dd>{overview.device.relayUrl}</dd>
          <dt>登录账号</dt>
          <dd>{overview.user}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>模型</h2>
        <p className="card-sub">默认模型与上游可用性。</p>
        <dl className="kv">
          <dt>默认模型</dt>
          <dd>{overview.settings.defaultModel ?? '跟随上次使用'}</dd>
          <dt>已配置模型</dt>
          <dd>{overview.settings.models} 个（{overview.settings.providers} 个供应商）</dd>
          <dt>上游探活</dt>
          <dd>
            {overview.upstream.ok ? `正常，返回 ${overview.upstream.count} 个模型` : `失败：${overview.upstream.error ?? '未知'}`}
          </dd>
          <dt>配置文件</dt>
          <dd>{overview.settings.path}</dd>
        </dl>
        <div style={{ marginTop: 14 }}>
          <button className="btn sm" onClick={onReload}>
            <IconRefresh size={13} /> 刷新
          </button>
        </div>
      </div>
    </>
  );
}

function ModelsTab(props: {
  providers: ProviderView[];
  allModels: { providerId: string; id: string }[];
  fields: Record<string, any>;
  onPatchProvider: (id: string, patch: Partial<ProviderView>) => void;
  onPatchField: (key: string, value: unknown) => void;
  onProviders: (next: ProviderView[]) => void;
  onDirty: () => void;
}) {
  const { providers, allModels, fields, onPatchProvider, onPatchField, onProviders, onDirty } = props;
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<Record<string, string>>({});

  const sync = async (providerId: string) => {
    setSyncing(providerId);
    setSyncNote(null);
    try {
      const result = await admin.syncModels(providerId, false);
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      const known = new Set(provider.models.map((m) => m.id));
      const add = result.available.filter((id) => !known.has(id));
      setSyncNote(
        add.length
          ? `上游共 ${result.available.length} 个模型，新增 ${add.length} 个：${add.slice(0, 6).join('、')}${add.length > 6 ? '…' : ''}`
          : `上游共 ${result.available.length} 个模型，与本地一致。`
      );
      if (add.length) {
        onProviders(providers.map((p) => (p.id === providerId ? { ...p, models: [...p.models, ...add.map((id) => ({ id, enabled: true }))] } : p)));
        onDirty();
      }
    } catch (err) {
      setSyncNote(`同步失败：${String((err as Error).message ?? err)}`);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <>
      <h1>模型与供应商</h1>
      <p className="lead">直接编辑桌面端的 provider 配置；保存时会先停桌面端再写文件，避免被内存状态覆盖。</p>

      {providers.map((provider) => (
        <div className="card" key={provider.id}>
          <h2>{provider.name || provider.id}</h2>
          <p className="card-sub">协议 {provider.api || 'openai-completions'} · {provider.models.filter((m) => m.enabled).length}/{provider.models.length} 个模型启用</p>

          <Row title="启用">
            <Toggle value={provider.enabled} onChange={(next) => onPatchProvider(provider.id, { enabled: next })} />
          </Row>
          <Row title="Base URL" hint="上游 OpenAI 兼容地址">
            <input className="input mono" value={provider.baseUrl} onChange={(e) => onPatchProvider(provider.id, { baseUrl: e.target.value })} />
          </Row>
          <Row title="API Key" hint={provider.hasKey ? `已保存 ${provider.keyHint}` : '尚未设置'}>
            <input
              className="input mono"
              type="password"
              placeholder={provider.hasKey ? '留空则保持不变' : '粘贴新的 key'}
              onChange={(e) => onPatchProvider(provider.id, { apiKeyInput: e.target.value } as any)}
            />
          </Row>

          <Row title="默认模型" hint="新会话默认使用">
            <select className="select" value={defaultKeyOf(fields)} onChange={(e) => onPatchField('defaultModel', parseModelValue(e.target.value))}>
              <option value="">跟随上次使用</option>
              {allModels.map((model) => (
                <option key={modelOptionValue(model.providerId, model.id)} value={modelOptionValue(model.providerId, model.id)}>
                  {model.id}
                </option>
              ))}
            </select>
          </Row>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 6px' }}>
            <b style={{ fontSize: 13 }}>模型</b>
            <button className="btn sm" disabled={syncing === provider.id} onClick={() => void sync(provider.id)}>
              <IconRefresh size={12} /> {syncing === provider.id ? '同步中…' : '从上游同步'}
            </button>
          </div>
          {syncNote && <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>{syncNote}</div>}

          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line-soft)', borderRadius: 10, padding: '4px 12px' }}>
            {provider.models.map((model) => (
              <div className="model-row" key={model.id}>
                <span className="model-id">{model.id}</span>
                {modelOptionValue(provider.id, model.id) === defaultKeyOf(fields) && <span className="tag default">默认</span>}
                <span className={`tag${model.enabled ? ' on' : ''}`}>{model.enabled ? '启用' : '停用'}</span>
                <Toggle
                  value={model.enabled}
                  onChange={(next) =>
                    onPatchProvider(provider.id, { models: provider.models.map((m) => (m.id === model.id ? { ...m, enabled: next } : m)) })
                  }
                />
                <button
                  className="icon-btn"
                  title="删除"
                  onClick={() => onPatchProvider(provider.id, { models: provider.models.filter((m) => m.id !== model.id) })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="input mono"
              placeholder="添加模型 id，例如 global:glm-5.3-flash"
              value={newModel[provider.id] ?? ''}
              onChange={(e) => setNewModel((prev) => ({ ...prev, [provider.id]: e.target.value }))}
              style={{ flex: 1 }}
            />
            <button
              className="btn sm"
              onClick={() => {
                const id = (newModel[provider.id] ?? '').trim();
                if (!id || provider.models.some((m) => m.id === id)) return;
                onPatchProvider(provider.id, { models: [...provider.models, { id, enabled: true }] });
                setNewModel((prev) => ({ ...prev, [provider.id]: '' }));
              }}
            >
              添加
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ChatDefaults({ fields, onPatch, allModels }: { fields: Record<string, any>; onPatch: (k: string, v: unknown) => void; allModels: { providerId: string; id: string }[] }) {
  return (
    <>
      <h1>会话默认</h1>
      <p className="lead">新会话继承的默认行为。</p>
      <div className="card">
        <Row title="默认模型">
          <select className="select" value={defaultKeyOf(fields)} onChange={(e) => onPatch('defaultModel', parseModelValue(e.target.value))}>
            <option value="">跟随上次使用</option>
            {allModels.map((model) => (
              <option key={modelOptionValue(model.providerId, model.id)} value={modelOptionValue(model.providerId, model.id)}>
                {model.id}
              </option>
            ))}
          </select>
        </Row>
        <Row title="默认开启思考">
          <Toggle value={Boolean(fields.defaultReasoningEnabled)} onChange={(next) => onPatch('defaultReasoningEnabled', next)} />
        </Row>
        <Row title="思考强度">
          <select className="select" value={fields.defaultThinkingLevel ?? 'medium'} onChange={(e) => onPatch('defaultThinkingLevel', e.target.value)}>
            {['off', 'low', 'medium', 'high', 'max'].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Row>
        <Row title="自动生成标题" hint="用模型给会话起短标题">
          <Toggle value={Boolean(fields.titleSummaryEnabled)} onChange={(next) => onPatch('titleSummaryEnabled', next)} />
        </Row>
        <Row title="智能压缩上下文" hint="接近上限时自动压缩历史">
          <Toggle value={Boolean(fields.smartCompactEnabled)} onChange={(next) => onPatch('smartCompactEnabled', next)} />
        </Row>
        <Row title="压缩策略">
          <select className="select" value={fields.compactStrategy ?? 'standard'} onChange={(e) => onPatch('compactStrategy', e.target.value)}>
            {['standard', 'aggressive', 'off'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Row>
      </div>
    </>
  );
}

function UiTab({ fields, onPatch }: { fields: Record<string, any>; onPatch: (k: string, v: unknown) => void }) {
  return (
    <>
      <h1>界面与行为</h1>
      <p className="lead">桌面端渲染进程的显示与自动化偏好。</p>
      <div className="card">
        <Row title="主题">
          <select className="select" value={fields.theme ?? 'system'} onChange={(e) => onPatch('theme', e.target.value)}>
            {['system', 'dark', 'light'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Row>
        <Row title="语言">
          <select className="select" value={fields.language ?? 'zh'} onChange={(e) => onPatch('language', e.target.value)}>
            {['zh', 'en'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Row>
        <Row title="宽屏对话">
          <Toggle value={Boolean(fields.chatWide)} onChange={(next) => onPatch('chatWide', next)} />
        </Row>
        <Row title="自动折叠已完成轮次">
          <Toggle value={Boolean(fields.autoCollapseTurns)} onChange={(next) => onPatch('autoCollapseTurns', next)} />
        </Row>
        <Row title="实时展开思考内容">
          <Toggle value={Boolean(fields.expandLiveReasoning)} onChange={(next) => onPatch('expandLiveReasoning', next)} />
        </Row>
        <Row title="闲置自动归档（天）" hint="0 表示不归档">
          <input
            className="input"
            type="number"
            min={0}
            value={Number(fields.autoArchiveIdleDays ?? 0)}
            onChange={(e) => onPatch('autoArchiveIdleDays', Number(e.target.value))}
            style={{ minWidth: 100 }}
          />
        </Row>
        <Row title="归档后自动删除（天）" hint="0 表示保留">
          <input
            className="input"
            type="number"
            min={0}
            value={Number(fields.autoDeleteArchivedDays ?? 0)}
            onChange={(e) => onPatch('autoDeleteArchivedDays', Number(e.target.value))}
            style={{ minWidth: 100 }}
          />
        </Row>
      </div>
    </>
  );
}

function AccountTab({ overview, onReload }: { overview: Overview | null; onReload: () => void }) {
  const [users, setUsers] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void admin
      .users({ action: 'list' })
      .then((result) => setUsers(result.users))
      .catch(() => undefined);
  }, []);

  const run = async (body: Record<string, unknown>, success: string) => {
    try {
      const result = await admin.users(body);
      setUsers(result.users);
      setMessage(success);
      setName('');
      setPassword('');
    } catch (err) {
      setMessage(String((err as Error).message ?? err));
    }
  };

  return (
    <>
      <h1>账号与安全</h1>
      <p className="lead">登录账号只做访问控制；所有账号共用同一台桌面端。</p>

      <div className="card">
        <h2>当前账号</h2>
        <p className="card-sub">{overview?.user}</p>
        <form
          style={{ display: 'flex', gap: 8, marginTop: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (password.length < 6) return setMessage('密码至少 6 位');
            void run({ action: 'passwd', username: overview?.user, password }, '密码已更新');
          }}
        >
          <input className="input" type="password" placeholder="设置新密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" type="submit">
            修改密码
          </button>
        </form>
      </div>

      <div className="card">
        <h2>账号列表</h2>
        <p className="card-sub">可以给家人或同事单独开一个账号。</p>
        {users.map((user) => (
          <div className="model-row" key={user}>
            <span className="model-id" style={{ fontFamily: 'inherit' }}>
              {user}
            </span>
            {user === overview?.user && <span className="tag default">当前</span>}
            {user !== overview?.user && (
              <button className="btn danger sm" onClick={() => void run({ action: 'delete', username: user }, `已删除 ${user}`)}>
                删除
              </button>
            )}
          </div>
        ))}
        <form
          style={{ display: 'flex', gap: 8, marginTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || password.length < 6) return setMessage('账号不能为空，密码至少 6 位');
            void run({ action: 'add', username: name.trim(), password }, `已添加 ${name.trim()}`);
          }}
        >
          <input className="input" placeholder="新账号" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" type="submit">
            添加
          </button>
        </form>
        {message && <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>{message}</div>}
      </div>

      <div className="card">
        <h2>让所有浏览器退出</h2>
        <p className="card-sub">轮换会话签名密钥，已登录的浏览器会立即失效，需要重新登录。</p>
        <button
          className="btn danger"
          onClick={async () => {
            try {
              await admin.rotate();
              setMessage('已轮换密钥，正在跳转登录页…');
              setTimeout(() => {
                window.location.href = `${(window as any).__ENSO_BOOT__?.base ?? '/enso'}/`;
              }, 1200);
            } catch (err) {
              setMessage(String((err as Error).message ?? err));
            }
          }}
        >
          轮换密钥并退出所有设备
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="btn sm ghost" onClick={onReload}>
          <IconRefresh size={12} /> 刷新状态
        </button>
      </div>
    </>
  );
}

function MaintenanceTab({ overview, onReload }: { overview: Overview | null; onReload: () => void }) {
  const [unit, setUnit] = useState<'desktop' | 'web'>('desktop');
  const [logs, setLogs] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadLogs = async (target: 'desktop' | 'web') => {
    setUnit(target);
    setBusy('logs');
    try {
      const result = await admin.logs(target, 240);
      setLogs(result.lines || '（暂无日志）');
    } catch (err) {
      setLogs(String((err as Error).message ?? err));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadLogs('desktop');
  }, []);

  const act = async (target: 'desktop' | 'web', action: string) => {
    setBusy(action);
    setMessage(null);
    try {
      const result = await admin.service(target, action);
      setMessage(`${target} ${action} → ${result.status}`);
      setTimeout(() => void onReload(), 2500);
    } catch (err) {
      setMessage(String((err as Error).message ?? err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1>维护</h1>
      <p className="lead">重启进程、查看日志。重启桌面端会短暂断开当前会话，历史会保留。</p>

      <div className="card">
        <h2>服务</h2>
        <dl className="kv">
          <dt>桌面端</dt>
          <dd>{overview?.desktop.active ? 'active' : 'inactive'}{overview?.desktop.mainPid ? ` · pid ${overview.desktop.mainPid}` : ''}</dd>
          <dt>网关</dt>
          <dd>pid {overview?.web.pid ?? '—'} · 已运行 {Math.round((overview?.web.uptime ?? 0) / 60)} 分钟</dd>
        </dl>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={busy !== null} onClick={() => void act('desktop', 'restart')}>
            重启桌面端
          </button>
          <button className="btn sm" disabled={busy !== null} onClick={() => void act('desktop', 'start')}>
            启动桌面端
          </button>
          <button className="btn sm danger" disabled={busy !== null} onClick={() => void act('desktop', 'stop')}>
            停止桌面端
          </button>
          <button className="btn sm" disabled={busy !== null} onClick={() => void act('web', 'restart')}>
            重启网关
          </button>
        </div>
        {message && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{message}</div>}
      </div>

      <div className="card">
        <h2>日志</h2>
        <p className="card-sub">最近 240 行。</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className={`btn sm${unit === 'desktop' ? ' primary' : ''}`} onClick={() => void loadLogs('desktop')}>
            桌面端
          </button>
          <button className={`btn sm${unit === 'web' ? ' primary' : ''}`} onClick={() => void loadLogs('web')}>
            网关
          </button>
          <button className="btn sm ghost" disabled={busy === 'logs'} onClick={() => void loadLogs(unit)}>
            <IconRefresh size={12} /> 刷新
          </button>
        </div>
        <pre className="log">{logs}</pre>
      </div>
    </>
  );
}
