import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '../store';
import { modelIdsOf, store } from '../store';
import { IconChevron, IconChip, IconFile, IconPaperclip, IconSend, IconSpark, IconStop, IconX } from './icons';
import { setPrefillHandler } from './composerBridge';
import {
  ATTACH_MAX_BYTES,
  base64ToBlob,
  describeFiles,
  formatBytes,
  isImageFile,
  newAttachmentId,
  prepareImage,
  toPromptImages,
  uploadAttachment,
  type AttachedItem
} from '../attach';

/** 上下文占用 + 令牌统计：都来自 host 的 session-meta */
function contextUsage(view: any): {
  pct: number;
  used: number;
  window?: number;
  buckets?: Record<string, number>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheHitPercent?: number;
    ttftAvgMs?: number;
    tokensPerSecond?: number;
  };
} | null {
  const occ = view?.occupancy;
  if (!occ || typeof occ !== 'object') return null;
  const used = typeof occ.used === 'number' ? occ.used : 0;
  const window =
    typeof occ.contextWindow === 'number'
      ? occ.contextWindow
      : typeof view?.contextWindow === 'number'
        ? view.contextWindow
        : undefined;
  const pct = typeof occ.percent === 'number' ? occ.percent : window ? (used / window) * 100 : 0;
  return { pct, used, window, buckets: occ.buckets, usage: view?.usageTotals };
}

function shortTokens(value?: number): string {
  if (!value || value < 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

const CTX_BUCKETS: { key: string; label: string }[] = [
  { key: 'conversation', label: '对话' },
  { key: 'tools', label: '工具' },
  { key: 'system', label: '设定' },
  { key: 'instructions', label: '指令' },
  { key: 'skills', label: '技能' },
  { key: 'projectMemory', label: '记忆' },
  { key: 'reminders', label: '提醒' },
  { key: 'compaction', label: '压缩' }
];

/** 把 host 的 occupancy.buckets 折成「对话 / 工具 / 设定」三档，与 Memoh 一致 */
function ctxRows(buckets?: Record<string, number>): { key: string; label: string; value: number }[] {
  if (!buckets) return [];
  const conversation = (buckets.conversation ?? 0) + (buckets.compaction ?? 0);
  const tools = buckets.tools ?? 0;
  const settings =
    (buckets.system ?? 0) +
    (buckets.instructions ?? 0) +
    (buckets.skills ?? 0) +
    (buckets.projectMemory ?? 0) +
    (buckets.reminders ?? 0);
  return [
    { key: 'conversation', label: '对话', value: conversation },
    { key: 'tools', label: '工具', value: tools },
    { key: 'system', label: '设定', value: settings }
  ].filter((row) => row.value > 0);
}

const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'max'];

interface ModelOption {
  providerId: string;
  providerName: string;
  id: string;
  label: string;
}

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/** 窄屏只显示模型名尾段（cn:minimax-m3 → minimax-m3），省出空间给发送键。 */
function shortModel(name: string | null | undefined): string {
  if (!name) return '';
  const tail = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
  return tail.includes('/') ? tail.slice(tail.lastIndexOf('/') + 1) : tail;
}

export function Composer({ state, running }: { state: AppState; running: boolean }) {
  const draft = state.draft;
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<null | 'model' | 'think' | 'project' | 'ctx'>(null);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<AttachedItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const entry = state.catalog.find((item) => item.id === state.activeId);
  const menuRef = useDismiss(menu !== null, () => setMenu(null));

  // 输入多行文本时动态自适应高度，发送/清空后自动复原
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextH = Math.min(Math.max(el.scrollHeight, 48), 240);
    el.style.height = `${nextH}px`;
  }, [text]);

  const models = useMemo<ModelOption[]>(() => {
    const list: ModelOption[] = [];
    for (const provider of state.providers) {
      if ((provider as any).enabled === false) continue;
      for (const model of ((provider.models ?? []) as any[])) {
        if (model && typeof model === 'object' && model.enabled === false) continue;
        const id = typeof model === 'string' ? model : model?.id;
        if (!id) continue;
        list.push({
          providerId: provider.id,
          providerName: provider.name ?? provider.id,
          id,
          label: (typeof model === 'object' && (model.label ?? model.name)) || id
        });
      }
    }
    return list;
  }, [state.providers]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(needle) ||
        model.label.toLowerCase().includes(needle) ||
        model.providerName.toLowerCase().includes(needle)
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const model of filtered) {
      const bucket = map.get(model.providerName) ?? [];
      bucket.push(model);
      map.set(model.providerName, bucket);
    }
    return [...map.entries()];
  }, [filtered]);

  // 还没有会话时（落地页/草稿）也要显示「将要用」的工作区与模型
  const preview = entry ? null : store.peekDraft();
  const showProject = !entry;
  const currentModel = draft ? draft.modelId : (entry?.modelId || preview?.modelId || '');
  const currentProvider = draft ? draft.providerId : (entry?.providerId || preview?.providerId || '');
  const reasoning = draft
    ? draft.reasoningEnabled
    : entry
      ? Boolean(entry.reasoningEnabled)
      : (preview?.reasoningEnabled ?? true);
  const thinking = String(
    (draft ? draft.thinkingLevel : (entry?.thinkingLevel ?? preview?.thinkingLevel)) ?? 'medium'
  );
  const project = state.projects.find(
    (item) => item.id === (draft ? draft.projectId : preview?.projectId)
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // 进入草稿时自动聚焦，少一次点击
  useEffect(() => {
    if (draft) ref.current?.focus();
  }, [draft !== null]);

  const busy = files.some((item) => item.status === 'reading' || item.status === 'uploading');
  const ready = files.filter((item) => item.status === 'ready');

  // 消息上的「编辑重发」把文本送回来：填进输入框并聚焦，不动会话历史
  useEffect(() => {
    setPrefillHandler((next) => {
      setText(next);
      setMenu(null);
      window.requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      });
    });
    return () => setPrefillHandler(null);
  }, []);

  /** 图片压缩后随 prompt 发走；其它文件先传到桌面端所在机器，再把路径写进正文。 */
  const addFiles = async (incoming: FileList | File[] | null) => {
    const list = Array.from(incoming ?? []).filter((file) => file.size > 0);
    if (!list.length) return;
    const queued: { item: AttachedItem; file: File }[] = list.map((file) => {
      const image = isImageFile(file);
      const tooBig = file.size > ATTACH_MAX_BYTES;
      return {
        file,
        item: {
          id: newAttachmentId(),
          name: file.name || (image ? '图片' : '文件'),
          mime: file.type || (image ? 'image/jpeg' : 'application/octet-stream'),
          size: file.size,
          kind: image ? 'image' : 'file',
          status: tooBig ? 'error' : image ? 'reading' : 'uploading',
          error: tooBig ? `超过 ${formatBytes(ATTACH_MAX_BYTES)}` : undefined
        }
      };
    });
    setFiles((prev) => [...prev, ...queued.map((entry) => entry.item)]);
    for (const { item, file } of queued) {
      if (item.status === 'error') continue;
      try {
        if (item.kind === 'image') {
          const prepared = await prepareImage(file);
          // 图片主要靠视觉通道，但顺手落一份到磁盘，模型想按路径读时不会扑空
          let savedPath: string | undefined;
          try {
            const jpgName = `${item.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
            const saved = await uploadAttachment(base64ToBlob(prepared.base64, prepared.mime), jpgName);
            savedPath = saved.path;
          } catch {
            savedPath = undefined;
          }
          setFiles((prev) =>
            prev.map((one) =>
              one.id === item.id
                ? {
                    ...one,
                    status: 'ready',
                    base64: prepared.base64,
                    previewUrl: prepared.previewUrl,
                    mime: prepared.mime,
                    path: savedPath
                  }
                : one
            )
          );
        } else {
          const uploaded = await uploadAttachment(file, file.name);
          setFiles((prev) =>
            prev.map((one) =>
              one.id === item.id
                ? { ...one, status: 'ready', path: uploaded.path, name: uploaded.name, size: uploaded.size }
                : one
            )
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '添加失败';
        setFiles((prev) => prev.map((one) => (one.id === item.id ? { ...one, status: 'error', error: message } : one)));
      }
    }
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((item) => item.id !== id));

  const submit = () => {
    if (busy) return;
    const value = text.trim();
    const images = toPromptImages(ready);
    if (!value && !ready.length) return;
    const body = `${value}${describeFiles(ready)}`.trim() || '请看一下这张图。';
    if (draft) store.sendDraft(body, images);
    else if (state.activeId) store.prompt(body, running, images);
    else {
      store.startDraft();
      store.sendDraft(body, images);
    }
    setText('');
    setFiles([]);
    setMenu(null);
    ref.current?.focus();
  };

  const pickModel = (model: ModelOption) => {
    if (entry) store.setModel(model.providerId, model.id);
    else if (draft) store.updateDraft({ providerId: model.providerId, modelId: model.id });
    else store.startDraft({ providerId: model.providerId, modelId: model.id });
    setMenu(null);
    setQuery('');
  };

  const toggleThinking = () => {
    if (entry) store.setReasoning(!reasoning);
    else if (draft) store.updateDraft({ reasoningEnabled: !reasoning });
    else store.startDraft({ reasoningEnabled: !reasoning });
  };

  const setLevel = (level: string) => {
    if (entry) store.setThinking(level);
    else if (draft) store.updateDraft({ thinkingLevel: level });
    else store.startDraft({ thinkingLevel: level });
    setMenu(null);
  };

  const canSend = !busy && (text.trim().length > 0 || ready.length > 0);

  return (
    <div className="composer-wrap">
      <div
        className={`composer${draft ? ' composer-draft' : ''}${dragging ? ' composer-drag' : ''}`}
        onDragOver={(event) => {
          if (!event.dataTransfer?.types?.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer?.files?.length) return;
          event.preventDefault();
          setDragging(false);
          void addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        {files.length > 0 && (
          <div className="attach-strip">
            {files.map((item) => (
              <div
                key={item.id}
                className={`attach-item${item.kind === 'image' ? ' attach-image' : ''}${item.status === 'error' ? ' attach-error' : ''}`}
                title={item.status === 'error' ? item.error : `${item.name} · ${formatBytes(item.size)}`}
              >
                {item.kind === 'image' && item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.name} />
                ) : (
                  <span className="attach-file">
                    <IconFile size={15} />
                    <span className="attach-file-text">
                      <span className="attach-name">{item.name}</span>
                      <span className="attach-meta">
                        {item.status === 'error'
                          ? item.error
                          : item.status === 'uploading'
                            ? '上传中…'
                            : formatBytes(item.size)}
                      </span>
                    </span>
                  </span>
                )}
                {item.status === 'reading' && <span className="attach-spinner" />}
                <button className="attach-remove" type="button" title="移除" onClick={() => removeFile(item.id)}>
                  <IconX size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={
            draft
              ? '描述要做的事，Enter 发送'
              : running
                ? '继续输入会排入队列，等这轮结束后发送…'
                : '输入消息，Enter 发送，Shift+Enter 换行'
          }
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            const plain = !event.shiftKey || event.metaKey || event.ctrlKey;
            if (event.key === 'Enter' && plain && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData?.files ?? []);
            if (!pasted.length) return;
            event.preventDefault();
            void addFiles(pasted);
          }}
        />

        <div className="composer-bar">
          <button
            className="attach-btn"
            type="button"
            title="添加附件（图片或文件，也可直接粘贴、拖进来）"
            onClick={() => fileRef.current?.click()}
          >
            <IconPaperclip size={16} />
          </button>
          <div className="bar-chips">
          <div className="chip-wrap" ref={menu === 'model' ? menuRef : undefined}>
            <button
              className={`chip${menu === 'model' ? ' open' : ''}`}
              title={`模型：${currentModel || '未选择'}`}
              onClick={() => setMenu(menu === 'model' ? null : 'model')}
            >
              <span className="chip-text mono">
                <span className="model-long">{currentModel || '选择模型'}</span>
                <span className="model-short">{shortModel(currentModel) || '选择模型'}</span>
              </span>
              <IconChevron size={12} />
            </button>
            {menu === 'model' && (
              <div className="popover popover-left popover-wide">
                <input
                  className="popover-search"
                  autoFocus
                  value={query}
                  placeholder={`搜索 ${models.length} 个模型`}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="popover-list">
                  {grouped.length === 0 && <div className="popover-empty">没有匹配的模型</div>}
                  {grouped.map(([providerName, items]) => (
                    <div key={providerName} className="popover-group">
                      <div className="popover-group-title">{providerName}</div>
                      {items.map((model) => {
                        const active = model.id === currentModel && model.providerId === currentProvider;
                        return (
                          <button
                            key={`${model.providerId}:${model.id}`}
                            className={`popover-item${active ? ' active' : ''}`}
                            onClick={() => pickModel(model)}
                          >
                            <span className="popover-item-main mono">{model.id}</span>
                            {active && <span className="popover-check">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="chip-wrap" ref={menu === 'think' ? menuRef : undefined}>
            <button
              className={`chip${reasoning ? ' chip-on' : ''}${menu === 'think' ? ' open' : ''}`}
              title={reasoning ? '思考已开启' : '思考已关闭'}
              onClick={() => setMenu(menu === 'think' ? null : 'think')}
            >
              <IconSpark size={13} />
              <span className="chip-text">
                {reasoning ? (
                  <>
                    <span className="think-label">思考 · </span>
                    {thinking}
                  </>
                ) : (
                  '思考'
                )}
              </span>
            </button>
            {menu === 'think' && (
              <div className="popover popover-left popover-think">
                <button className={`popover-row${reasoning ? ' on' : ''}`} onClick={toggleThinking}>
                  <span>扩展思考</span>
                  <span className={`switch${reasoning ? ' on' : ''}`} aria-hidden="true" />
                </button>
                <div className="popover-divider" />
                {THINKING_LEVELS.map((level) => (
                  <button
                    key={level}
                    className={`popover-item${level === thinking ? ' active' : ''}`}
                    disabled={!reasoning}
                    onClick={() => setLevel(level)}
                  >
                    <span className="popover-item-main">{level}</span>
                    {level === thinking && <span className="popover-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          </div>
          <span className="spacer" />

          {(() => {
            const ctx = contextUsage(store.view(state.activeId));
            if (!ctx) return null;
            const pct = Math.max(0, Math.min(100, ctx.pct));
            const dash = (pct / 100) * 94.25;
            return (
              <div className="chip-wrap" ref={menu === 'ctx' ? menuRef : undefined}>
                <button
                  className={`ctx-ring${menu === 'ctx' ? ' open' : ''}`}
                  title={`上下文占用 ${Math.round(pct)}%（点击看明细）`}
                  onClick={() => setMenu(menu === 'ctx' ? null : 'ctx')}
                >
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle className="ctx-ring-track" cx="18" cy="18" r="15" />
                    <circle
                      className="ctx-ring-value"
                      cx="18"
                      cy="18"
                      r="15"
                      strokeDasharray={`${dash} 94.25`}
                    />
                  </svg>
                  <span className="ctx-ring-num">{Math.round(pct)}%</span>
                </button>
                {menu === 'ctx' && (
                  <div className="popover popover-right ctx-popover">
                    <div className="ctx-head">
                      <strong>{Math.round(pct)}%</strong>
                      <span>
                        ~{shortTokens(ctx.used)} / {ctx.window ? shortTokens(ctx.window) : '—'}
                      </span>
                    </div>
                    <div className="ctx-bar">
                      {ctxRows(ctx.buckets).map((row) => (
                        <span
                          key={row.key}
                          className={`ctx-bar-seg ${row.key}`}
                          style={{ width: `${ctx.window ? Math.max(1, (row.value / ctx.window) * 100) : 0}%` }}
                        />
                      ))}
                    </div>
                    <div className="ctx-rows">
                      {ctxRows(ctx.buckets).map((row) => (
                        <div className="ctx-row" key={row.key}>
                          <span className={`ctx-dot ${row.key}`} />
                          <span className="ctx-row-label">{row.label}</span>
                          <span className="ctx-row-value">{shortTokens(row.value)}</span>
                        </div>
                      ))}
                    </div>
                    {ctx.usage && (
                      <div className="ctx-foot">
                        <div className="ctx-foot-tokens">
                          <span>↑ {shortTokens(ctx.usage.inputTokens)}</span>
                          <span>↓ {shortTokens(ctx.usage.outputTokens)}</span>
                          {typeof ctx.usage.cacheHitPercent === 'number' && (
                            <span>缓存 {Math.round(ctx.usage.cacheHitPercent)}%</span>
                          )}
                        </div>
                        {(typeof ctx.usage.tokensPerSecond === 'number' || typeof ctx.usage.ttftAvgMs === 'number') && (
                          <div className="ctx-foot-perf">
                            {typeof ctx.usage.tokensPerSecond === 'number' && (
                              <span>⚡ {ctx.usage.tokensPerSecond.toFixed(1)} tok/s</span>
                            )}
                            {typeof ctx.usage.ttftAvgMs === 'number' && (
                              <span>首字 {Math.round(ctx.usage.ttftAvgMs)}ms</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}


          {running ? (
            <button className="send-btn stop" title="停止" onClick={() => store.abort()}>
              <IconStop size={15} />
            </button>
          ) : (
            <button className="send-btn" title="发送" disabled={!canSend} onClick={submit}>
              <IconSend size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
