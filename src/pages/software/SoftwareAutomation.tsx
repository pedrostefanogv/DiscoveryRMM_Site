import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';

export default function SoftwareAutomation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Automacao de Softwares</h1>
        <p className="text-sm text-slate-400">
          Esta pagina foi mantida por compatibilidade. O novo modulo de automacao fica em area propria.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Modulo migrado"
          subtitle="Use a nova area para scripts, tarefas e operacoes por agent."
        />

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-slate-300">
            <Wrench className="h-4 w-4" />
            <span className="text-sm">Status atual: modulo de automacao ativo em nova navegacao</span>
          </div>
          <p className="text-sm text-slate-400">
            Acesse Scripts, Tarefas e Operacoes para gerir automacoes administrativas.
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Link to="/automation">
            <Button size="sm">Abrir novo modulo de Automacao</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
