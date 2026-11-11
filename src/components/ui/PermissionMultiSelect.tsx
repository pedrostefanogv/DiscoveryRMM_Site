import { useId, useMemo, useState, type ReactElement } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Uma permissão oferecida pelo seletor múltiplo.
 */
export interface PermissionOption {
  id: string;
  /** Rótulo completo exibido na lista (ex.: "Users.Edit - Users:Edit"). */
  label: string;
  /** Código da permissão (ex.: "Users.Edit"), usado também na busca. */
  code?: string;
  /** Agrupador visual (ex.: "Users"). Opções sem grupo caem em "Outras permissões". */
  group?: string;
  /** Trava a opção: aparece marcada e não pode ser desmarcada. */
  disabled?: boolean;
}

export interface PermissionMultiSelectProps {
  options: PermissionOption[];
  /** Ids selecionados — estado 100% controlado pelo chamador. */
  value: string[];
  /** Recebe SEMPRE a lista de ids resultante (value atual + item alternado). */
  onChange: (next: string[]) => void;
  /** Ids já vinculados: marcados, com selo "Já vinculada" e travados. */
  alreadyAssignedIds?: string[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Classe de altura máxima da lista rolável (padrão "max-h-72"). */
  maxHeightClassName?: string;
  emptyMessage?: string;
}

/** Marcador interno para opções sem grupo. */
const OUTROS = "__outros__";
const ROTULO_OUTROS = "Outras permissões";

/**
 * Seletor múltiplo de permissões com busca, agrupamento e ação em lote.
 *
 * Componente de apresentação: não guarda estado de seleção (a seleção é
 * inteiramente controlada por `value`/`onChange`) e não conhece nenhuma página.
 * Os únicos estados locais são o termo de busca e o estado de foco dos itens.
 */
export function PermissionMultiSelect({
  options,
  value,
  onChange,
  alreadyAssignedIds,
  loading = false,
  disabled = false,
  placeholder = "Buscar por nome ou código...",
  maxHeightClassName = "max-h-72",
  emptyMessage = "Nenhuma permissão corresponde ao filtro.",
}: PermissionMultiSelectProps): ReactElement {
  // Id único por instância: evita colisão quando dois seletores ficam montados
  // ao mesmo tempo (aba + modal) e o `<label>` de um focar o campo do outro.
  const searchId = useId();
  const [busca, setBusca] = useState("");
  const [focadoId, setFocadoId] = useState<string | null>(null);

  // Conjuntos derivados na renderização (sem estado espelho nem useEffect).
  const idsVinculados = useMemo(
    () => new Set(alreadyAssignedIds ?? []),
    [alreadyAssignedIds],
  );
  const idsSelecionados = useMemo(() => new Set(value), [value]);

  const termo = busca.trim().toLowerCase();
  const opcoesFiltradas = useMemo(() => {
    if (!termo) return options;
    // Busca case-insensitive tanto pelo rótulo quanto pelo código.
    return options.filter(
      (opcao) =>
        opcao.label.toLowerCase().includes(termo) ||
        (opcao.code ?? "").toLowerCase().includes(termo),
    );
  }, [options, termo]);

  /** Uma opção está travada quando é vinculada, veio disabled ou o campo está desabilitado. */
  const estaTravada = (opcao: PermissionOption): boolean =>
    disabled || Boolean(opcao.disabled) || idsVinculados.has(opcao.id);

  const estaMarcada = (opcao: PermissionOption): boolean =>
    idsSelecionados.has(opcao.id) || idsVinculados.has(opcao.id);

  /** Opções visíveis que podem ser marcadas (não vinculadas e não disabled). */
  const marcaveisVisiveis = useMemo(
    () => opcoesFiltradas.filter((opcao) => !estaTravada(opcao)),
    // estaTravada é função pura derivada das props memoizadas acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opcoesFiltradas, disabled, idsVinculados],
  );

  /** Todas as opções visíveis que podem ser marcadas já estão marcadas? */
  const todasVisiveisMarcadas =
    marcaveisVisiveis.length > 0 &&
    marcaveisVisiveis.every((opcao) => estaMarcada(opcao));

  // Agrupamento visual; a ordem dos grupos segue a ordem do catálogo recebido.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; opcoes: PermissionOption[] }>();
    for (const opcao of opcoesFiltradas) {
      const chave = opcao.group ?? OUTROS;
      const rotulo = opcao.group ?? ROTULO_OUTROS;
      const atual = mapa.get(chave);
      if (atual) {
        atual.opcoes.push(opcao);
      } else {
        mapa.set(chave, { rotulo, opcoes: [opcao] });
      }
    }
    return Array.from(mapa.values());
  }, [opcoesFiltradas]);

  const alternarOpcao = (opcao: PermissionOption) => {
    if (estaTravada(opcao)) return;
    // Preserva a ordem atual do value e anexa/remove apenas o id alternado.
    const proximo = idsSelecionados.has(opcao.id)
      ? value.filter((id) => id !== opcao.id)
      : [...value, opcao.id];
    onChange(proximo);
  };

  const alternarTodosVisiveis = () => {
    if (todasVisiveisMarcadas) {
      const idsVisiveis = new Set(marcaveisVisiveis.map((opcao) => opcao.id));
      onChange(value.filter((id) => !idsVisiveis.has(id)));
      return;
    }

    const proximo = [...value];
    for (const opcao of marcaveisVisiveis) {
      // Vinculadas e disabled ficam de fora: nunca são duplicadas.
      if (!proximo.includes(opcao.id)) proximo.push(opcao.id);
    }
    onChange(proximo);
  };

  const rotuloAcaoLote = todasVisiveisMarcadas
    ? `Limpar seleção (${marcaveisVisiveis.length})`
    : `Selecionar todos os ${marcaveisVisiveis.length} resultados`;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor={searchId}
          className="block text-sm font-medium text-muted-foreground"
        >
          Buscar permissão
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            id={searchId}
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full rounded-xl border border-border bg-surface-light py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={alternarTodosVisiveis}
          disabled={disabled || loading || marcaveisVisiveis.length === 0}
        >
          <Icon name={todasVisiveisMarcadas ? "undo" : "done_all"} className="h-4 w-4" />
          {rotuloAcaoLote}
        </Button>

        <p className="text-xs text-muted">
          <span className="font-medium text-foreground">
            {value.length} selecionada(s)
          </span>
          {" · "}
          {opcoesFiltradas.length} de {options.length} permissão(ões)
        </p>
      </div>

      <p aria-live="polite" className="text-xs text-muted">
        {options.length === 0
          ? emptyMessage
          : `${opcoesFiltradas.length} de ${options.length} permissão(ões) exibida(s) para o filtro atual.`}
      </p>

      <div
        role="group"
        aria-label="Permissões"
        aria-busy={loading}
        className={`space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 ${maxHeightClassName}`}
      >
        {loading ? (
          <p className="p-2 text-sm text-muted">Carregando permissões...</p>
        ) : opcoesFiltradas.length === 0 ? (
          <p className="p-2 text-sm text-muted">{emptyMessage}</p>
        ) : (
          grupos.map((grupo) => (
            <fieldset key={grupo.rotulo} className="space-y-1">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {grupo.rotulo}
              </legend>
              {grupo.opcoes.map((opcao) => {
                const vinculada = idsVinculados.has(opcao.id);
                const marcada = estaMarcada(opcao);
                const travada = estaTravada(opcao);

                return (
                  <label
                    key={opcao.id}
                    onMouseEnter={() => setFocadoId(opcao.id)}
                    onMouseLeave={() =>
                      setFocadoId((atual) => (atual === opcao.id ? null : atual))
                    }
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      focadoId === opcao.id
                        ? "border-border-strong bg-surface-light"
                        : "border-transparent"
                    } ${travada && !vinculada ? "cursor-not-allowed opacity-60" : ""} ${
                      vinculada ? "bg-surface-light/60" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      checked={marcada}
                      disabled={travada}
                      aria-label={opcao.label}
                      onChange={() => alternarOpcao(opcao)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {opcao.label}
                        </span>
                        {vinculada && (
                          <Badge color="success">Já vinculada</Badge>
                        )}
                      </span>
                      {(opcao.code || vinculada) && (
                        <span className="block text-xs text-muted">
                          {opcao.code ?? opcao.id}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))
        )}
      </div>
    </div>
  );
}
