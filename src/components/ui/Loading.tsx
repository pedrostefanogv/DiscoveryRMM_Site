import { Loader2 } from 'lucide-react';

interface LoadingProps {
  message?: string;
  variant?: 'spinner' | 'dots';
  size?: 'sm' | 'md' | 'lg';
}

export function Loading({ message = 'Carregando...', variant = 'spinner', size = 'md' }: LoadingProps) {
  const sizeMap = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20" role="status" aria-label={message}>
      {variant === 'spinner' ? (
        <Loader2 className={`${sizeMap[size]} animate-spin text-primary`} />
      ) : (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`inline-block rounded-full bg-primary animate-bounce ${size === 'sm' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-3 w-3' : 'h-2 w-2'}`}
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
      <span className="text-sm text-slate-500">{message}</span>
    </div>
  );
}

interface ErrorDisplayProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({
  message = 'Ocorreu um erro inesperado.',
  onRetry,
}: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 ring-1 ring-danger/20">
        <svg className="h-7 w-7 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-sm text-slate-400 max-w-sm text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
