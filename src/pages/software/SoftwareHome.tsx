import { Link } from 'react-router-dom';

import { Icon, Button, Card, CardHeader, type MaterialSymbolName } from '@/components/ui';

const cards: { title: string; description: string; to: string; cta: string; icon: MaterialSymbolName }[] = [
  {
    title: 'Apps',
    description: 'Inventario detalhado com filtros por cliente, site e busca de software.',
    to: '/software/inventory',
    cta: 'Abrir Inventario Detalhado',
    icon: "web_asset",
  },
  {
    title: 'Automação',
     description: 'Scripts, tarefas e operações de automação centralizadas.',
     to: '/automation',
     cta: 'Abrir Automação',
    icon: "build",
  },
  {
    title: 'Loja de Apps',
     description: 'Loja e distribuição de apps.',
    to: '/software/store',
    cta: 'Abrir Loja de Apps',
    icon: "storefront",
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
                    return (
            <Card key={card.to}>
              <CardHeader
                title={card.title}
                subtitle={card.description}
                action={<Icon name={card.icon} className="h-4 w-4 text-muted" />}
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
