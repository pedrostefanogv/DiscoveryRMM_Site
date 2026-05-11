import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function PwaUpdatePrompt() {
  const checkIntervalRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;

      checkIntervalRef.current = window.setInterval(() => {
        void registration.update();
      }, CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void updateServiceWorker(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (checkIntervalRef.current !== null) {
        window.clearInterval(checkIntervalRef.current);
      }
    };
  }, [updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[1000] w-[min(92vw,720px)] -translate-x-1/2 rounded-xl border border-sky-500/35 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            Nova versao da interface disponivel
          </p>
          <p className="text-xs text-slate-300">
            Recomendado recarregar agora para aplicar o novo build e limpar recursos em cache.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              void updateServiceWorker(true);
            }}
            className="bg-sky-600 hover:bg-sky-700"
          >
            Recarregar agora
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload forcado
          </Button>
        </div>
      </div>
    </div>
  );
}