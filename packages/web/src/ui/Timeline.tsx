import React, { useMemo, useState } from 'react';
import type { AppState } from '../store';
import { store } from '../store';
import type { GuestSessionView } from '@shared/pair/guestProjection';
import { Markdown } from './Markdown';
import { MessageActions } from './MessageActions';
import { ToolGroup } from './ToolGroup';
import { UserText } from './UserText';
import { prefillComposer } from './composerBridge';
import { IconRefresh, IconShield, IconSpark } from './icons';

function timeLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function textOf(parts: any[] | undefined): string {
  return (parts ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

/** 相邻消息跨天时的分隔标签；同一天返回空串。 */
function dayDivider(prevTs: number | undefined, ts: number | undefined): string {
  if (!ts) return '';
  const day = new Date(ts);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const start = startOf(day);
  if (prevTs) {
    if (startOf(new Date(prevTs)) === start) return '';
  }
  const now = new Date();
  const todayStart = startOf(now);
  if (start === todayStart) return '今天';
  if (start === todayStart - 86400000) return '昨天';
  return day.getFullYear() === now.getFullYear()
    ? `${day.getMonth() + 1}月${day.getDate()}日`
    : `${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`;
}

type TimelineNode =
  | { kind: 'msg'; index: number; msg: any }
  | { kind: 'tools'; id: string; tools: any[]; ts?: number };

interface TimelineNodeProps {
  node: TimelineNode;
  dayLabel: string;
  results: Map<string, any>;
  running: boolean;
  isLastAssistant: boolean;
  userIndexFromEnd?: number;
  onOpenLightbox: (src: string) => void;
}

/** 独立的消息项组件：通过 React.memo 与精细比对，流式吐字时跳过历史消息无谓渲染 */
const TimelineNodeView = React.memo(
  function TimelineNodeView({
    node,
    dayLabel,
    results,
    running,
    isLastAssistant,
    userIndexFromEnd,
    onOpenLightbox,
  }: TimelineNodeProps) {
    if (node.kind === 'tools') {
      return (
        <div className="msg" key={node.id}>
          {dayLabel && <div className="ux-day">{dayLabel}</div>}
          <div className="msg-body">
            <ToolGroup tools={node.tools} results={results} running={running} />
          </div>
        </div>
      );
    }
    const index = node.index;
    const msg = node.msg;
    if (msg.role === 'user') {
      const text = textOf(msg.content);
      const images = (msg.content ?? []).filter((p: any) => p?.type === 'image');
      return (
        <div className="msg user" key={index} data-index={index}>
          {dayLabel && <div className="ux-day">{dayLabel}</div>}
          {images.length > 0 && (
            <div className="msg-media">
              {images.map((img: any, i: number) => {
                const src = `data:${img.mimeType};base64,${img.data}`;
                return (
                  <button
                    key={i}
                    type="button"
                    className="msg-thumb"
                    onClick={() => onOpenLightbox(src)}
                    title="查看大图"
                  >
                    <img alt="" src={src} />
                  </button>
                );
              })}
            </div>
          )}
          {text && (
            <div className="bubble-user">
              <UserText text={text} />
            </div>
          )}
          {text && <MessageActions role="user" text={text} onEdit={() => prefillComposer(text)} onRewind={typeof userIndexFromEnd === "number" && userIndexFromEnd > 0 && !running ? () => store.rewind(userIndexFromEnd) : undefined} />}
        </div>
      );
    }

    if (msg.role === 'assistant') {
      const thinking = (msg.content ?? []).filter((p: any) => p?.type === 'thinking' && p.text);
      const text = textOf(msg.content);
      const tools = (msg.content ?? []).filter((p: any) => p?.type === 'toolCall');
      if (!text && !thinking.length && !tools.length && !msg.errorMessage) return null;
      // 正在思考且正文未出现时自动展开，正文到达后自动收拢
      const thinkingLive = isLastAssistant && running && !text;

      return (
        <div className="msg" key={index} data-index={index}>
          {dayLabel && <div className="ux-day">{dayLabel}</div>}
          <div className="msg-head">
            {msg.model && <span className="msg-model">{msg.model}</span>}
            {msg.timestamp ? <span>{timeLabel(msg.timestamp)}</span> : null}
          </div>
          <div className="msg-body">
            {thinking.map((part: any, i: number) => (
              <details className="thinking" key={i} open={thinkingLive ? true : undefined}>
                <summary>
                  <IconSpark size={12} /> 思考过程
                  {thinkingLive && <span className="thinking-live">思考中…</span>}
                </summary>
                <div className="thinking-body">{part.text}</div>
              </details>
            ))}
            <ToolGroup tools={tools} results={results} running={running} />
            {text && (
              <div className="msg-text-stream">
                <Markdown text={text} />
                {isLastAssistant && running && <span className="typing-cursor" aria-hidden="true" />}
              </div>
            )}
            <MessageActions
              role="assistant"
              text={text}
              onRetry={isLastAssistant && !running ? () => store.retry() : undefined}
            />
            {msg.errorMessage && (
              <div className="error-line">
                <span>上游返回错误：{String(msg.errorMessage)}</span>
                <button className="btn sm" onClick={() => store.retry()}>
                  <IconRefresh size={12} /> 重试
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    const text = textOf(msg.content);
    if (!text) return null;
    return (
      <div className="msg" key={index} data-index={index} style={{ color: 'var(--muted)', fontSize: 12.5 }}>
        {dayLabel && <div className="ux-day">{dayLabel}</div>}
        {text}
      </div>
    );
  },
  (prev, next) => {
    if (prev.dayLabel !== next.dayLabel) return false;
    if (prev.isLastAssistant !== next.isLastAssistant) return false;
    if (prev.running !== next.running) return false;
    if (prev.node.kind !== next.node.kind) return false;
    if (prev.node.kind === 'tools') {
      const prevTools = prev.node.tools;
      const nextTools = (next.node as any).tools;
      if (prevTools.length !== nextTools.length) return false;
      for (let i = 0; i < prevTools.length; i++) {
        if (prevTools[i] !== nextTools[i]) return false;
      }
      return true;
    }
    return prev.node.msg === (next.node as any).msg;
  }
);

export function Timeline({ state, view, sessionId }: { state: AppState; view: GuestSessionView; sessionId: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const items = useMemo(() => {
    const entries = [...view.messages.entries()].sort((a, b) => a[0] - b[0]);
    return entries.filter(([, msg]) => msg.role !== 'toolResult');
  const userIndices = useMemo(() => {
    return items.filter(([, m]) => m.role === 'user').map(([idx]) => idx);
  }, [items]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, state.rev, sessionId]);

  const running = view.status === 'running' || view.status === 'streaming' || view.status === 'waiting';
  const results = new Map<string, any>();
  for (const [, msg] of view.messages) {
    if (msg.role === 'toolResult' && msg.toolCallId) results.set(msg.toolCallId, msg);
  }

  const lastAssistantIndex = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i][1].role === 'assistant') return items[i][0];
    }
    return -1;
  })();

  // 连续「只含工具调用、没有正文」的 assistant 消息合成一个过程块，
  // 与桌面端「过程 N 个工具调用」的呈现保持一致。
  const nodes = useMemo(() => {
    const out: TimelineNode[] = [];
    let run: { index: number; part: any; ts?: number }[] = [];
    const flush = () => {
      if (!run.length) return;
      out.push({ kind: 'tools', id: `tools-${run[0].index}`, tools: run.map((item) => item.part), ts: run[0].ts });
      run = [];
    };
    for (const [index, msg] of items) {
      const parts: any[] = msg.content ?? [];
      const calls = parts.filter((part) => part?.type === 'toolCall');
      if (msg.role === 'assistant' && !textOf(parts) && calls.length) {
        for (const part of calls) run.push({ index, part, ts: msg.timestamp });
        continue;
      }
      flush();
      out.push({ kind: 'msg', index, msg });
    }
    flush();
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <>
      {nodes.map((node, i) => {
        const prevNode = i > 0 ? nodes[i - 1] : null;
        const prevTs = prevNode ? (prevNode.kind === 'msg' ? prevNode.msg.timestamp : prevNode.ts) : undefined;
        const dayLabel = dayDivider(prevTs, node.kind === 'msg' ? node.msg.timestamp : node.ts);
        const isLastAssistant = node.kind === 'msg' && node.index === lastAssistantIndex;
        const userPos = node.kind === 'msg' && node.msg.role === 'user' ? userIndices.indexOf(node.index) : -1;
        const userIndexFromEnd = userPos >= 0 ? userIndices.length - userPos : undefined;
        return (
          <TimelineNodeView
            key={node.kind === 'tools' ? node.id : node.index}
            node={node}
            dayLabel={dayLabel}
            results={results}
            running={running}
            isLastAssistant={isLastAssistant}
            userIndexFromEnd={userIndexFromEnd}
            onOpenLightbox={setLightbox}
          />
        );
      })}

      {view.approvals.map((approval) => (
        <div className="approval" key={approval.requestId}>
          <div className="approval-title">
            <IconShield size={14} /> 需要你确认：{approval.tool}
          </div>
          <div className="approval-body">{approval.summary}</div>
          <div className="approval-actions">
            <button className="btn primary sm" onClick={() => store.approve(approval.requestId, 'allow')}>
              允许一次
            </button>
            <button className="btn sm" onClick={() => store.approve(approval.requestId, 'allowSession')}>
              本会话都允许
            </button>
            <button className="btn danger sm" onClick={() => store.approve(approval.requestId, 'deny')}>
              拒绝
            </button>
          </div>
        </div>
      ))};

      {view.asks.map((ask) => (
        <AskCard key={ask.requestId} ask={ask} />
      ))}

      {view.compaction && (
        <div className="run-line">
          <span className="spinner" /> {view.compaction === 'running' ? '正在压缩上下文…' : '上下文压缩排队中…'}
        </div>
      )}

      {view.retry && (
        <div className="run-line">
          <span className="spinner" /> 正在自动重试（第 {view.retry.attempt ?? 1} 次）
        </div>
      )}

            {(state.queued[sessionId] ?? []).map((q) => (
        <div className="msg queued" key={q.id}>
          <div className="queued-label">
            <span className="spinner" /> 排队中 · 本轮结束后发送
            <button
              className="btn sm"
              type="button"
              style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
              onClick={() => store.sendQueuedNow(sessionId, q.id)}
              title="打断当前轮次并立即发送"
            >
              立即发送
            </button>
            <button className="btn sm" type="button" onClick={() => store.dequeue(sessionId, q.id)}>
              撤回
            </button>
          </div>
          <div className="bubble-user queued-bubble">
            {q.text}
          </div>
        </div>
      ))}

      {running && !view.compaction && (
        <div className="run-line">
          <span className="spinner" /> {view.status === 'waiting' ? '等待你的确认…' : '正在生成…'}
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  );
}

function AskCard({ ask }: { ask: any }) {
  const options: string[] = ask.options ?? [];
  return (
    <div className="ask">
      <div className="ask-title">需要你的回答</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{ask.question}</div>
      <div className="ask-actions">
        {options.map((option) => (
          <button key={option} className="btn sm" onClick={() => store.answer(ask.requestId, option)}>
            {option}
          </button>
        ))}
        <form
          style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}
          onSubmit={(event) => {
            event.preventDefault();
            const input = (event.currentTarget.elements.namedItem('answer') as HTMLInputElement | null)?.value ?? '';
            if (input.trim()) store.answer(ask.requestId, input.trim());
          }}
        >
          <input className="input" name="answer" placeholder="输入回答…" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn sm" type="submit">
            回答
          </button>
        </form>
      </div>
    </div>
  );
}
