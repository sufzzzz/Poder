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

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
