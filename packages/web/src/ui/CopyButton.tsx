import { useState } from 'react';

/** 复制按钮：成功后在原位显示 ✓ 一秒；无剪贴板权限时退回到 execCommand */
export function CopyButton({ text, className }: { text: string | (() => string); className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    const value = typeof text === 'function' ? text() : text;
    if (!value) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // 非 HTTPS、iframe 或权限被拒时的兜底
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1200);
    } else {
      setFailed(true);
      setTimeout(() => setFailed(false), 1600);
    }
  };

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' done' : ''}${failed ? ' failed' : ''}${className ? ' ' + className : ''}`}
      title={copied ? '已复制' : failed ? '复制失败' : '复制代码'}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
    >
      {copied ? '✓' : failed ? '!' : '复制'}
    </button>
  );
}