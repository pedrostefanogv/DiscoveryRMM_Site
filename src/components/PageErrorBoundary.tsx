import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button, Card, CardHeader } from "@/components/ui";

/**
 * Error boundary de página. Diferente do ErrorPage raiz (que substitui a aplicação
 * inteira e mostra "API offline"), este é aplicado por rota, dentro do layout
 * autenticado: um crash de uma tela não derruba o menu nem a navegação.
 */
export function PageErrorBoundary() {
  const error = useRouteError();

  const isRouteResponse = isRouteErrorResponse(error);
  const message = isRouteResponse
    ? `Erro ${error.status}: ${error.statusText || "falha ao carregar a página"}`
    : error instanceof Error
      ? error.message
      : "Erro inesperado ao renderizar esta página.";

  return (
    <Card className="border-danger/40 bg-danger/5">
      <CardHeader
        title="Não foi possível exibir esta página"
        subtitle="As demais áreas do console continuam disponíveis."
      />

      <p className="text-sm text-muted">{message}</p>

      {import.meta.env.DEV && error instanceof Error && error.stack && (
        <pre className="mt-3 overflow-auto rounded-lg border border-border bg-background/80 p-3 font-mono text-xs text-muted">
          {error.stack}
        </pre>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Recarregar página
        </Button>
        <Button variant="ghost" onClick={() => { window.location.href = "/"; }}>
          Voltar ao início
        </Button>
      </div>
    </Card>
  );
}
