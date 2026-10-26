import { useState } from 'react';
import { Icon, Button, Card } from '@/components/ui';
import { CatalogTab } from './tabs/CatalogTab';
import { ApprovalsTab } from './tabs/ApprovalsTab';
import { AuditTab } from './tabs/AuditTab';

type StoreTab = 'catalog' | 'approvals' | 'audit';

export default function SoftwareStore() {
  const [tab, setTab] = useState<StoreTab>('catalog');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loja de Softwares</h1>
          <p className="mt-1 text-sm text-muted">
            Catálogo de apps com aprovação por escopo e trilha de auditoria.
          </p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === 'catalog' ? 'primary' : 'ghost'}
            onClick={() => setTab('catalog')}
          >
            <Icon name="inventory_2" className="h-4 w-4" /> Catálogo
          </Button>
          <Button
            variant={tab === 'approvals' ? 'primary' : 'ghost'}
            onClick={() => setTab('approvals')}
          >
            <Icon name="verified_user" className="h-4 w-4" /> Aprovações
          </Button>
          <Button
            variant={tab === 'audit' ? 'primary' : 'ghost'}
            onClick={() => setTab('audit')}
          >
            <Icon name="assignment" className="h-4 w-4" /> Auditoria
          </Button>
        </div>
      </Card>

      {tab === 'catalog' && <CatalogTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
