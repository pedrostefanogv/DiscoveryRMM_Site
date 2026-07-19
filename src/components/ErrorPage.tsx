import { useRouteError, isRouteErrorResponse } from 'react-router-dom';

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
          {title}
        </h1>

        <p className="text-sm text-muted text-center mb-5">
          {message}
        </p>

        {details && (
          <div className="rounded-xl bg-background/80 border border-border p-3 mb-5 font-mono text-xs text-muted break-words">
            {details}
          </div>
        )}

        <p className="text-xs text-muted text-center mb-4">
          Possíveis causas:
        </p>
        <ul className="text-xs text-muted space-y-1.5 mb-5 list-disc list-inside">
          <li>API offline ou indisponível</li>
          <li>Problema na conexão de rede</li>
          <li>Servidor pode estar reiniciando</li>
          <li>Erro ao carregar módulo da aplicação</li>
        </ul>

        <div className="space-y-2">
          <button
            onClick={handleReload}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Voltar ao Início
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    </div>
  );
}
