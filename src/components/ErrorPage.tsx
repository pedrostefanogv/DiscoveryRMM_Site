import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { Button } from '@/components/ui';

export function ErrorPage() {
  const error = useRouteError();
  
  const getErrorMessage = () => {
    if (isRouteErrorResponse(error)) {
      return {
        title: `Erro ${error.status}`,
        message: error.statusText || 'Um erro ocorreu',
        details: error.data?.message,
      };
    }
    
    if (error instanceof Error) {
      return {
        title: 'Erro ao carregar página',
        message: error.message,
        details: error.stack,
      };
    }
    
    return {
      title: 'Erro desconhecido',
      message: 'Um erro inesperado ocorreu',
      details: String(error),
    };
  };

  const { title, message, details } = getErrorMessage();

  const handleReload = () => {
    window.location.href = '/';
  };

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
          {title}
        </h1>
        
        <p className="text-slate-300 text-center mb-4">
          {message}
        </p>

        {details && (
          <div className="bg-slate-900 rounded p-3 mb-6 border border-slate-700">
            <p className="text-xs text-slate-400 font-mono break-words">
              {details}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm text-slate-400 text-center mb-4">
            Possíveis causas:
          </p>
          <ul className="text-sm text-slate-400 space-y-1 mb-4">
            <li>• API offline ou indisponível</li>
            <li>• Problema na conexão de rede</li>
            <li>• Servidor pode estar reiniciando</li>
            <li>• Erro ao carregar módulo da aplicação</li>
          </ul>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleReload}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Voltar ao Início
          </Button>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    </div>
  );
}
