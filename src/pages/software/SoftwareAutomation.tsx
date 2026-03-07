import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';

export default function SoftwareAutomation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Automacao de Softwares</h1>
        <p className="text-sm text-slate-400">
          Esta area esta preparada para receber os endpoints de automacao quando a API estiver disponivel.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Em breve"
          subtitle="Fluxos de instalacao, atualizacao e remediacao serao habilitados apos a entrega da API."
        />

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-slate-300">
            <Wrench className="h-4 w-4" />
            <span className="text-sm">Status atual: aguardando endpoints backend</span>
          </div>
          <p className="text-sm text-slate-400">
            Enquanto isso, voce pode usar o Inventario Detalhado para identificar versoes e planejar automacoes.
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Link to="/software/inventory">
            <Button size="sm">Abrir Inventario Detalhado</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
