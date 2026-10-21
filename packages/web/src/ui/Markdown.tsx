import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from './CopyButton';

/** 从 hast 节点里取出代码原文（pre > code > text） */
function nodeText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  return '';
}

/** 从 code 节点的 className 里提取代码语言名（如 language-ts -> ts） */
function extractLang(node: any): string {
  try {
    const codeNode = node?.children?.find((c: any) => c.tagName === 'code') ?? node?.children?.[0];
    const classList = codeNode?.properties?.className;
    const classes = Array.isArray(classList) ? classList : [classList];
    for (const cls of classes) {
      if (typeof cls === 'string' && cls.startsWith('language-')) {
        return cls.slice('language-'.length).toLowerCase();
      }
    }
  } catch {}
  return '';
}

/** 独立的代码块组件：带语言徽标、复制按钮以及超长代码（>28行）智能折叠与渐变展开 */
const CodeBlockView = React.memo(function CodeBlockView({
  children,
  node
}: {
  children: React.ReactNode;
  node: any;
}) {
  const code = nodeText(node).replace(/\n$/, '');
  const lang = extractLang(node);
  const lineCount = useMemo(() => (code ? code.split('\n').length : 0), [code]);
  const isLong = lineCount > 28;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`code-wrap${isLong && !expanded ? ' code-collapsed' : ''}`}>
      {lang ? <span className="code-lang">{lang}</span> : null}
      <div className="code-actions">
        {isLong && (
          <button
            type="button"
            className="copy-btn code-fold-btn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? '收起超长代码' : '展开全部代码'}
          >
            {expanded ? '收起' : `展开 (${lineCount}行)`}
          </button>
        )}
        {code ? <CopyButton text={code} className="code-copy-btn" /> : null}
      </div>
      <pre>{children}</pre>
      {isLong && !expanded && (
        <div className="code-expand-mask" onClick={() => setExpanded(true)}>
          <button type="button" className="code-expand-pill">
            展开全部 {lineCount} 行代码 ↓
          </button>
        </div>
      )}
    </div>
  );
});

export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          pre: ({ children, node }) => <CodeBlockView node={node}>{children}</CodeBlockView>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});