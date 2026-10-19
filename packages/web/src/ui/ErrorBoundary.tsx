import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 出错时不要白屏，把真实原因显示出来，方便定位。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: 'var(--mono)', fontSize: 13, color: '#ffb4ae' }}>
        <div style={{ fontSize: 15, marginBottom: 12, color: 'var(--text)' }}>页面出错了</div>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#ffb4ae' }}>{this.state.error.message}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#8b919c', marginTop: 12 }}>{this.state.error.stack}</pre>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }
}