import { useState } from 'react';
import { IconChevron } from './icons';

function preview(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').slice(0, 160);
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  } catch {
    return String(value);
  }
}

function resultText(result: any): string {
  if (!result) return '';
  const parts = (result.content ?? []) as { type: string; text?: string }[];
  const text = parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
  if (text) return text;
  if (result.errorMessage) return String(result.errorMessage);
  return '';
}

export function ToolCard(props: { name: string; input?: unknown; result?: any; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const output = resultText(props.result);
  const failed = Boolean(props.result?.isError);
  const state = props.pending || !props.result ? 'running' : failed ? 'failed' : 'done';
  const stateText = state === 'running' ? '执行中' : state === 'failed' ? '失败' : '完成';

  return (
    <div className="tool">
      <div className="tool-head" onClick={() => setOpen((v) => !v)}>
        <IconChevron size={13} className={open ? '' : 'rot'} />
        <span className="tool-name">{props.name || 'tool'}</span>
        <span className="tool-arg">{preview(props.input)}</span>
        <span className={`tool-state ${state === 'done' ? 'ok' : state === 'failed' ? 'err' : ''}`}>{stateText}</span>
      </div>
      {open && (
        <div className="tool-body">
          {props.input !== undefined && (
            <pre>{typeof props.input === 'string' ? props.input : JSON.stringify(props.input, null, 2)}</pre>
          )}
          {output && (
            <pre style={{ marginTop: props.input !== undefined ? 10 : 0 }}>{output.slice(0, 12000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}