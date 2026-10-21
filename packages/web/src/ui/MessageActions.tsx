import { useEffect, useState } from 'react';
import { IconCopy, IconPencil, IconRefresh, IconRewind } from './icons';

/** 优先用异步剪贴板；被权限或非安全上下文挡住时退回 execCommand。 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 消息下方的操作条（对齐 Memoh 的 message-actions）。
 * 桌面端悬停才出现，触屏常显；复制成功后短暂显示「已复制」。
 */
export function MessageActions({
  role,
  text,
  onRetry,
  onEdit,
  onRewind
}: {
  role: 'user' | 'assistant';
  text: string;
  onRetry?: () => void;
  onEdit?: () => void;
  onRewind?: () => void;
}) {
  const [note, setNote] = useState<'' | '已复制' | '复制失败'>('');

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(''), 1400);
    return () => clearTimeout(timer);
  }, [note]);

  const copy = async () => {
    if (!text) return;
    setNote((await writeClipboard(text)) ? '已复制' : '复制失败');
  };

  return (
    <div className={`ux-actions ux-actions-${role}`}>
      <button
        className={`ux-action${note === '已复制' ? ' done' : ''}${note === '复制失败' ? ' bad' : ''}`}
        type="button"
        title={note || '复制'}
        aria-label={note || '复制'}
        onClick={copy}
        disabled={!text}
      >
        <IconCopy size={13} />
        {note && <span className="ux-action-note">{note}</span>}
      </button>
      {role === 'assistant' && onRetry && (
        <button className="ux-action" type="button" title="重新生成" aria-label="重新生成" onClick={onRetry}>
          <IconRefresh size={13} />
        </button>
      )}
      {role === 'user' && onEdit && (
        <button className="ux-action" type="button" title="编辑重发" aria-label="编辑重发" onClick={onEdit}>
          <IconPencil size={13} />
        </button>
      )}
      {role === 'user' && onRewind && (
        <button
          className="ux-action"
          type="button"
          title="回滚到此轮对话（之后的回复将被裁剪）"
          aria-label="回滚到此处"
          onClick={() => {
            if (window.confirm('确定要回滚到此处？此后的对话内容将被裁剪。')) {
              onRewind();
            }
          }}
        >
          <IconRewind size={13} />
        </button>
      )}
    </div>
  );
}