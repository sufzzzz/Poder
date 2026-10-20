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

export function Markdown({ text }: { text: string }) {
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
          // 代码块右上角挂复制按钮，与桌面端 CodeBlock 一致
          pre: ({ children, node }) => {
            const code = nodeText(node).replace(/\n$/, '');
            return (
              <div className="code-wrap">
                {code ? <CopyButton text={code} className="code-copy" /> : null}
                <pre>{children}</pre>
              </div>
            );
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}