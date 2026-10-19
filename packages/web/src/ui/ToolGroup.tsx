import { useState } from 'react';
import { ToolCard } from './ToolCard';
import { IconChevron } from './icons';

/**
 * 一条 assistant 消息里连续多次工具调用收成一组（对齐 Memoh 的 tool-call-group）。
 * 只有一次调用时保持原来的单卡片样式。
 */
export function ToolGroup({
  tools,
  results,
  running
}: {
  tools: any[];
  results: Map<string, any>;
  running: boolean;
}) {
  // 有失败的工具调用时默认展开，免得错误被折叠藏起来
  const [open, setOpen] = useState(() => tools.some((part) => Boolean(results.get(part.id)?.isError)));

  if (tools.length === 0) return null;
  if (tools.length === 1) {
    const part = tools[0];
    return (
      <ToolCard name={part.name} input={part.arguments} result={results.get(part.id)} pending={!results.get(part.id) && running} />
    );
  }

  const failed = tools.filter((part) => Boolean(results.get(part.id)?.isError)).length;
  const pending = tools.some((part) => !results.get(part.id)) && running;
  const stateText = pending ? '执行中' : failed > 0 ? `${failed} 个失败` : '完成';
  const stateClass = pending ? 'live' : failed > 0 ? 'bad' : 'ok';

  return (
    <div className={`ux-tool-group${open ? ' open' : ''}`}>
      <button
        className="ux-tool-group-head"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconChevron size={13} className={`ux-tool-group-caret${open ? '' : ' rot'}`} />
        <span className="ux-tool-group-title">{tools.length} 次工具调用</span>
        <span className={`ux-tool-group-state ${stateClass}`}>{stateText}</span>
      </button>
      {open && (
        <div className="ux-tool-group-body">
          {tools.map((part) => (
            <ToolCard
              key={part.id}
              name={part.name}
              input={part.arguments}
              result={results.get(part.id)}
              pending={!results.get(part.id) && running}
            />
          ))}
        </div>
      )}
    </div>
  );
}