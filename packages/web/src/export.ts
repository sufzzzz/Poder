import { store } from './store';

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function textOfMessage(msg: any): string {
  const parts = (msg?.content ?? []) as any[];
  return parts
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

/** 把当前或指定会话格式化为整洁的 Markdown 文档 */
export function sessionToMarkdown(sessionId: string, title?: string): string {
  const state = store.getSnapshot();
  const entry = state.catalog.find((c) => c.id === sessionId);
  const sessionTitle = title || entry?.title || '会话记录';
  const view = store.view(sessionId);

  const lines: string[] = [
    `# ${sessionTitle}`,
    '',
    `> 导出时间：${formatTimestamp(Date.now())}`,
    ...(entry?.modelId ? [`> 默认模型：${entry.modelId}`] : []),
    '',
    '---',
    ''
  ];

  const sorted = [...view.messages.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, msg] of sorted) {
    if (msg.role === 'toolResult') continue; // 内部工具返回在 assistant 块内有上下文
    const text = textOfMessage(msg);
    if (!text && msg.role !== 'assistant') continue;

    const time = formatTimestamp(msg.timestamp);
    if (msg.role === 'user') {
      lines.push(`### 👤 用户${time ? ` · ${time}` : ''}`, '', text || '(附件)', '', '---', '');
    } else if (msg.role === 'assistant') {
      const modelTag = msg.model ? ` (${msg.model})` : '';
      lines.push(`### 🤖 助手${modelTag}${time ? ` · ${time}` : ''}`, '', text || (msg.errorMessage ? `⚠️ 错误：${msg.errorMessage}` : ''), '', '---', '');
    }
  }

  return lines.join('\n');
}

/** 触发浏览器直接下载 Markdown 文件 */
export function downloadSessionMarkdown(sessionId: string, title?: string): void {
  const md = sessionToMarkdown(sessionId, title);
  const safeName = (title || '会话记录').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${safeName}-${dateStr}.md`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 复制整篇会话为 Markdown 到剪贴板 */
export async function copySessionMarkdown(sessionId: string, title?: string): Promise<boolean> {
  const md = sessionToMarkdown(sessionId, title);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement('textarea');
    area.value = md;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
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