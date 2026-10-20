import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { applyThemeMode, readThemeMode } from './store';
import './styles.css';
import './usage.css';

applyThemeMode(readThemeMode() ?? 'system');
// 跟随系统时，系统配色变了要立刻跟上
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((readThemeMode() ?? 'system') === 'system') applyThemeMode('system');
});

// 注册 service worker：Chrome 判断「可安装」要求有 SW + manifest
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL
    }).catch(() => {
      /* 注册失败不影响使用，只是没有安装入口 */
    });
  });
}

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
