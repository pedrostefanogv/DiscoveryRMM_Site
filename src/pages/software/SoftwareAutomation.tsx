import { Link } from 'react-router-dom';

import {  Icon, Button, Card, CardHeader, PageHeader } from '@/components/ui';

export default function SoftwareAutomation() {
  return (
    <div className="space-y-6">
      <PageHeader title="Automação de Softwares" description="Esta página foi mantida por compatibilidade. O novo módulo de automação fica em área própria." />

      <Card>
        <CardHeader
          title="Modulo migrado"
          subtitle="Use a nova área para scripts, tarefas e operações por agent."
        />

        <div className="rounded-lg border border-border bg-surface-light p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Icon name="build" className="h-4 w-4" />
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
