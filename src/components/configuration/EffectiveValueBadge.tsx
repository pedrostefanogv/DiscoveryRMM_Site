import { Badge } from "@/components/ui";
import type { ConfigurationOrigin } from "@/api";

interface EffectiveValueBadgeProps {
  origin: ConfigurationOrigin;
}

export function EffectiveValueBadge({ origin }: EffectiveValueBadgeProps) {
  const color = origin === "Site" ? "accent" : origin === "Client" ? "warning" : "primary";
  return <Badge color={color}>Origem: {origin}</Badge>;
}
