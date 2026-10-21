import React, { useEffect } from 'react';
import { IconX } from './icons';

interface ShortcutGroup {
  category: string;
  items: { key: string; label: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: '导航与搜索',
    items: [
      { key: 'Cmd / Ctrl + K', label: '聚焦会话标题搜索' },
      { key: 'Cmd / Ctrl + F', label: '在当前对话中全文查找' },
      { key: '?', label: '打开快捷键指南' },
      { key: 'Esc', label: '退出查找 / 收起菜单 / 取消' },
    ],
  },
  {
    category: '消息与输入',
    items: [
      { key: 'Enter', label: '发送消息（生成中按回车加入排队）' },
      { key: 'Shift + Enter', label: '在输入框中换行' },
      { key: '↑ 方向键', label: '输入框为空时恢复上一条提问' },
      { key: '/ 斜杠', label: '呼出斜杠快捷命令菜单' },
    ],
  },
  {
    category: '常用斜杠指令 (输入 /)',
    items: [
      { key: '/compact', label: '摘要压缩当前会话上下文' },
      { key: '/export', label: '导出当前会话为 Markdown 文档' },
      { key: '/retry', label: '重新生成助手最近一轮回答' },
      { key: '/new', label: '开启新的空白会话草稿' },
      { key: '/clear', label: '清空当前输入框文字' },
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">键盘快捷键指南</div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <IconX size={15} />
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUTS.map((group) => (
            <div className="shortcut-group" key={group.category}>
              <div className="shortcut-group-title">{group.category}</div>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div className="shortcut-row" key={item.key}>
                    <span className="shortcut-label">{item.label}</span>
                    <kbd className="shortcut-kbd">{item.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}