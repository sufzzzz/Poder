import { useMemo, useState } from 'react';

const LIMIT_CHARS = 600;
const LIMIT_LINES = 12;

/** 长用户消息默认折叠（对齐 Memoh 的 collapsible-user-text）。 */
export function UserText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = useMemo(
    () => text.length > LIMIT_CHARS || text.split('\n').length > LIMIT_LINES,
    [text]
  );

  if (!long) return <>{text}</>;

  return (
    <div className={`ux-user-text${open ? ' open' : ''}`}>
      <div className="ux-user-text-body">{text}</div>
      <button className="ux-user-text-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? '收起' : '展开全文'}
      </button>
    </div>
  );
}