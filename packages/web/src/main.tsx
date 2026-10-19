import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);