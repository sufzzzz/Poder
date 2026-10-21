import React from 'react';
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
          // 代码块右上角挂复制按钮，左上角显示语言徽标，与现代代码编辑器一致
          pre: ({ children, node }) => {
            const code = nodeText(node).replace(/\n$/, '');
            const lang = extractLang(node);
            return (
              <div className="code-wrap">
                {lang ? <span className="code-lang">{lang}</span> : null}
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
});