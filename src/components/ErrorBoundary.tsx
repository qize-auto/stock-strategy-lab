import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-void flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[rgba(11,12,16,0.6)] border border-[rgba(206,209,213,0.08)] rounded-sm p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="font-heading text-lg text-pure mb-2">页面出错了</h2>
            <p className="font-mono text-xs text-ash/40 mb-6">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 border border-apex-green/30 text-apex-green font-mono text-sm rounded-sm hover:bg-[rgba(0,255,148,0.08)] transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
