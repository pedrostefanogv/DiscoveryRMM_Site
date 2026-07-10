import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';

export default function SoftwareAutomation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automação de Softwares</h1>
        <p className="text-sm text-muted">
          Esta página foi mantida por compatibilidade. O novo módulo de automação fica em área própria.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Modulo migrado"
          subtitle="Use a nova área para scripts, tarefas e operações por agent."
        />

        <div className="rounded-lg border border-border bg-surface-light p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Wrench className="h-4 w-4" />
            <span className="text-sm">Status atual: módulo de automação ativo em nova navegação</span>
          </div>
          <p className="text-sm text-muted">
            Acesse Scripts, Tarefas e Operações para gerir automações administrativas.
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Link to="/automation">
            <Button size="sm">Abrir novo modulo de Automação</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
