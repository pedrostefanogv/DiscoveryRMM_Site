import { Component, ReactNode, ErrorInfo } from 'react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-lg border border-slate-700 p-8 shadow-xl">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white text-center mb-2">
              Erro na Aplicação
            </h1>
            
            <p className="text-slate-300 text-center mb-4">
              Algo deu errado ao renderizar essa página. Por favor, tente novamente.
            </p>

            {this.state.error && (
              <div className="bg-slate-900 rounded p-3 mb-6 border border-slate-700">
                <p className="text-xs text-slate-400 font-mono break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Button
                onClick={this.handleReset}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Tentar Novamente
              </Button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
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
