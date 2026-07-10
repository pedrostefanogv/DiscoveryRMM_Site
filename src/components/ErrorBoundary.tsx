import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary genérico. Suporta fallback customizado via props.
 * Use <ErrorBoundary fallback={<MeuFallback />}> para páginas específicas.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 bg-danger/10 rounded-2xl flex items-center justify-center ring-1 ring-danger/20">
                <svg
                  className="w-8 h-8 text-danger"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
            </div>

            <h1 className="text-xl font-bold text-foreground text-center mb-2">
              Erro na Aplicação
            </h1>

            <p className="text-sm text-muted text-center mb-5">
              Algo deu errado ao renderizar essa página. Por favor, tente novamente.
            </p>

            {this.state.error && (
              <div className="rounded-xl bg-background/80 border border-border p-3 mb-5 font-mono text-xs text-muted break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-primary/90"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover"
              >
                Voltar ao Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
