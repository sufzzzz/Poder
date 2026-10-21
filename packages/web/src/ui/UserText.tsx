import { useMemo, useState } from 'react';
import { boot } from '../boot';

const LIMIT_CHARS = 600;
const LIMIT_LINES = 12;

interface ParsedAttachment {
  path: string;
  name: string;
  size?: string;
}

function parseUserMessage(raw: string): { cleanText: string; attachments: ParsedAttachment[] } {
  const marker = '\n\n附件（已放在本机，可直接读取）：\n';
  const idx = raw.indexOf(marker);
  if (idx < 0) return { cleanText: raw, attachments: [] };

  const cleanText = raw.slice(0, idx).trim();
  const attSection = raw.slice(idx + marker.length);
  const attachments: ParsedAttachment[] = [];

  const lineRegex = /^-\s+([^\s]+)\s*(?:[（(]([^，,()\n]+)(?:[，,]\s*([^()\n]+))?[)）])?/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(attSection)) !== null) {
    const filePath = match[1];
    const fileName = match[2]?.trim() || filePath.split('/').pop() || 'file';
    const fileSize = match[3]?.trim();
    attachments.push({ path: filePath, name: fileName, size: fileSize });
  }

  return { cleanText: cleanText || '(附件)', attachments };
}

/** 长用户消息默认折叠；若包含文件附件，自动解析为优雅的下载卡片 */
export function UserText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { cleanText, attachments } = useMemo(() => parseUserMessage(text), [text]);

  const long = useMemo(
    () => cleanText.length > LIMIT_CHARS || cleanText.split('\n').length > LIMIT_LINES,
    [cleanText]
  );

  return (
    <div className="user-text-wrap">
      {long ? (
        <div className={`ux-user-text${open ? ' open' : ''}`}>
          <div className="ux-user-text-body">{cleanText}</div>
          <button className="ux-user-text-toggle" type="button" onClick={() => setOpen((v) => !v)}>
            {open ? '收起' : '展开全文'}
          </button>
        </div>
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>{cleanText}</div>
      )}

      {attachments.length > 0 && (
        <div className="att-list" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {attachments.map((att, i) => (
            <a
              key={i}
              href={`${boot.base}/api/admin/download?path=${encodeURIComponent(att.path)}`}
              target="_blank"
              rel="noreferrer"
              className="att-card"
              download
              title={`点击下载 ${att.name}`}
            >
              <span className="att-card-icon">📎</span>
              <span className="att-card-name">{att.name}</span>
              {att.size && <span className="att-card-size">{att.size}</span>}
              <span className="att-card-dl">下载</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}