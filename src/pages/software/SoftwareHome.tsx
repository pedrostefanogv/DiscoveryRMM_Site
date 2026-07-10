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
    title: 'Automação',
     description: 'Scripts, tarefas e operações de automação centralizadas.',
     to: '/automation',
     cta: 'Abrir Automação',
    icon: Wrench,
  },
  {
    title: 'Loja de Apps',
     description: 'Loja e distribuição de apps.',
    to: '/software/store',
    cta: 'Abrir Loja de Apps',
    icon: Store,
  },
];

export default function SoftwareHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Softwares</h1>
        <p className="text-sm text-muted">Escolha um módulo para gerenciar aplicativos e distribuição.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.to}>
              <CardHeader
                title={card.title}
                subtitle={card.description}
                action={<Icon className="h-4 w-4 text-muted" />}
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
