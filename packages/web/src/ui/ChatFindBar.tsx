import React, { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../store';
import { IconChevron, IconX } from './icons';

function textOfMessage(msg: any): string {
  const parts = (msg?.content ?? []) as any[];
  return parts
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
}

export function ChatFindBar({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 挂载时自动聚焦并全选输入框
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const view = store.view(sessionId);

  // 计算当前会话中所有命中该关键词的消息 index 列表
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const entries = [...view.messages.entries()].sort((a, b) => a[0] - b[0]);
    const hits: number[] = [];
    for (const [idx, msg] of entries) {
      if (msg.role === 'toolResult') continue;
      const t = textOfMessage(msg).toLowerCase();
      if (t.includes(q)) hits.push(idx);
    }
    return hits;
  }, [view.messages, query]);

  // query 改变时重置当前匹配项
  useEffect(() => {
    setCurrentMatch(matches.length > 0 ? 1 : 0);
  }, [matches.length, query]);

  // 跳转并高亮聚焦对应的消息 DOM
  const scrollToMatch = (matchNumber: number) => {
    if (matchNumber < 1 || matchNumber > matches.length) return;
    const targetIdx = matches[matchNumber - 1];
    const el = document.querySelector<HTMLElement>(`.msg[data-index="${targetIdx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-find-highlight');
      setTimeout(() => el.classList.remove('msg-find-highlight'), 1800);
    }
  };

  const next = () => {
    if (!matches.length) return;
    const nextIdx = currentMatch >= matches.length ? 1 : currentMatch + 1;
    setCurrentMatch(nextIdx);
    scrollToMatch(nextIdx);
  };

  const prev = () => {
    if (!matches.length) return;
    const prevIdx = currentMatch <= 1 ? matches.length : currentMatch - 1;
    setCurrentMatch(prevIdx);
    scrollToMatch(prevIdx);
  };

  return (
    <div className="chat-find-bar" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="find-input"
        placeholder="在当前对话中查找…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          }
        }}
      />
      <span className="find-count">
        {query ? (matches.length > 0 ? `${currentMatch}/${matches.length}` : '无结果') : ''}
      </span>
      <button
        className="find-btn"
        type="button"
        title="上一个 (Shift+Enter)"
        disabled={!matches.length}
        onClick={prev}
      >
        <IconChevron size={14} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button
        className="find-btn"
        type="button"
        title="下一个 (Enter)"
        disabled={!matches.length}
        onClick={next}
      >
        <IconChevron size={14} />
      </button>
      <button className="find-btn find-close" type="button" title="关闭 (Esc)" onClick={onClose}>
        <IconX size={13} />
      </button>
    </div>
  );
}