import { useTheme } from '@/theme/ThemeContext';
import { Card, CardHeader, Input, Button } from '@/components/ui';

export default function BrandingSettings() {
  const { branding, updateBranding, resetBranding } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted">Personalização e branding</p>
      </div>

      <Card>
        <CardHeader title="Branding" subtitle="Personalize cores e identidade visual" />
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            label="Nome da aplicação"
            value={branding.appName}
            onChange={e => updateBranding({ appName: e.target.value })}
          />
          <Input
            label="URL do logo"
            placeholder="https://..."
            value={branding.logoUrl ?? ''}
            onChange={e => updateBranding({ logoUrl: e.target.value || null })}
          />
          <ColorPicker
            label="Cor primária"
            value={branding.primaryColor}
            onChange={v => updateBranding({ primaryColor: v })}
          />
          <ColorPicker
            label="Cor de destaque"
            value={branding.accentColor}
            onChange={v => updateBranding({ accentColor: v })}
          />
          <ColorPicker
            label="Cor da sidebar"
            value={branding.sidebarColor}
            onChange={v => updateBranding({ sidebarColor: v })}
          />
          <ColorPicker
            label="Cor do header"
            value={branding.headerColor}
            onChange={v => updateBranding({ headerColor: v })}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={resetBranding}>Restaurar Padrão</Button>
        </div>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader title="Preview" subtitle="Veja como as cores ficam" />
        <div className="grid grid-cols-4 gap-3">
          <Swatch label="Primary" color={branding.primaryColor} />
          <Swatch label="Accent" color={branding.accentColor} />
          <Swatch label="Sidebar" color={branding.sidebarColor} />
          <Swatch label="Header" color={branding.headerColor} />
        </div>
      </Card>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent"
        />
        <input
          type="text"
          aria-label={`${label} (hex)`}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50"
        />
      </div>
    </div>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="text-center">
      <svg className="mb-2 h-16 w-full rounded-lg border border-border" viewBox="0 0 100 64" aria-hidden="true" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="64" fill={color} />
      </svg>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xs text-muted font-mono">{color}</p>
    </div>
  );
}
