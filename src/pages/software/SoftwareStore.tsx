import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';

export default function SoftwareStore() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Store de Softwares</h1>
        <p className="text-sm text-slate-400">
          Esta area sera ativada quando a API de catalogo e distribuicao estiver disponivel.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Em breve"
          subtitle="Catalogo, aprovacao e distribuicao de apps serao integrados nesta tela."
        />

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-slate-300">
            <Store className="h-4 w-4" />
            <span className="text-sm">Status atual: aguardando endpoints backend</span>
          </div>
          <p className="text-sm text-slate-400">
            A politica da store pode ser ajustada nas configuracoes globais enquanto a API dedicada nao chega.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Link to="/settings/server">
            <Button size="sm" variant="ghost">Politica de Store</Button>
          </Link>
          <Link to="/software/inventory">
            <Button size="sm">Abrir Inventario Detalhado</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
