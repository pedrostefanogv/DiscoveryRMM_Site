import { Link } from 'react-router-dom';
import { AppWindow, Store, Wrench } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';

const cards = [
  {
    title: 'Apps',
    description: 'Inventario detalhado com filtros por cliente, site e busca de software.',
    to: '/software/inventory',
    cta: 'Abrir Inventario Detalhado',
    icon: AppWindow,
  },
  {
    title: 'Automacao',
    description: 'Fluxos de instalacao e remediacao. Estrutura pronta para API futura.',
    to: '/software/automation',
    cta: 'Abrir Automacao',
    icon: Wrench,
  },
  {
    title: 'Store',
    description: 'Catalogo e distribuicao de apps. Tela pronta para integracao futura.',
    to: '/software/store',
    cta: 'Abrir Store',
    icon: Store,
  },
];

export default function SoftwareHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Softwares</h1>
        <p className="text-sm text-slate-400">Escolha um modulo para gerenciar aplicativos e distribuicao.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.to}>
              <CardHeader
                title={card.title}
                subtitle={card.description}
                action={<Icon className="h-4 w-4 text-slate-400" />}
              />

              <Link to={card.to}>
                <Button size="sm">{card.cta}</Button>
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
