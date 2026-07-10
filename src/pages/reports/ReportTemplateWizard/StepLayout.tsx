import { Button } from "@/components/ui";
import { LiveMarkdownPreview } from "./components/LiveMarkdownPreview";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  wizard: ReturnType<typeof import("./hooks/useWizardState").useWizardState>;
  onBack: () => void;
  onNext: () => void;
}

export function StepLayout({ wizard, onBack, onNext }: Props) {
  const { state } = wizard;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const normalizeSubTableField = (field: string, alias: string) =>
    field.startsWith(`${alias}.`) ? field.slice(alias.length + 1) : field;

  const availableSubTableDatasets = state.selectedDatasets.filter(
    (dataset) =>
      !dataset.isPrimary &&
      !state.subTables.some((subTable) => subTable.sourceAlias === dataset.alias),
  );

  const getAvailableFieldsForSubTable = (subTable: typeof state.subTables[number]) => {
    const usedFields = new Set(
      subTable.columns.map((column) =>
        normalizeSubTableField(column.field, subTable.sourceAlias),
      ),
    );

    return wizard.allFields.filter(
      (field) => field.alias === subTable.sourceAlias && !usedFields.has(field.name),
    );
  };

  const addFieldToSubTable = (
    subTableId: string,
    sourceAlias: string,
    selectedField: string,
  ) => {
    const fieldName = normalizeSubTableField(selectedField, sourceAlias);

    const updated = state.subTables.map((subTable) => {
      if (subTable.id !== subTableId) return subTable;

      const alreadyExists = subTable.columns.some(
        (column) =>
          normalizeSubTableField(column.field, subTable.sourceAlias) === fieldName,
      );

      if (alreadyExists) return subTable;

      return {
        ...subTable,
        columns: [
          ...subTable.columns,
          {
            field: fieldName,
            header: fieldName,
            format: "text" as const,
            align: "left" as const,
            sourceAlias,
          },
        ],
      };
    });

    wizard.setField("subTables", updated as any);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Organize os dados
        </h2>
        <p className="text-sm text-muted">
          Defina agrupamentos, colunas principais e sub-tabelas.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: Editor */}
        <div className="space-y-6">
          {/* Grouping */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Agrupamento
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Agrupar por
                </label>
                <select
                  value={state.groupBy}
                  onChange={(e) => wizard.setField("groupBy", e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                >
                  <option value="" className="bg-surface">
                    Sem agrupamento
                  </option>
                  {wizard.allFields.map((f) => (
                    <option
                      key={f.reference}
                      value={f.reference}
                      className="bg-surface"
                    >
                      {f.reference} ({f.datasetName})
                    </option>
                  ))}
                </select>
              </div>
              {state.groupBy && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Título do grupo
                  </label>
                  <input
                    type="text"
                    placeholder={"{{" + state.groupBy + "}}"}
                    value={state.groupTitleTemplate}
                    onChange={(e) =>
                      wizard.setField("groupTitleTemplate", e.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
                  />
                </div>
              )}
            </div>
            {state.groupBy && (
              <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={state.hideGroupColumn}
                  onChange={(e) =>
                    wizard.setField("hideGroupColumn", e.target.checked)
                  }
                />
                Ocultar coluna de agrupamento
              </label>
            )}
          </div>

          {/* Main columns */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                📋 Tabela Principal
              </h3>
              <select
                onChange={(e) => {
                  if (e.target.value) wizard.addColumn(e.target.value);
                  e.target.value = "";
                }}
                className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
                defaultValue=""
              >
                <option value="" className="bg-surface">
                  + Adicionar coluna
                </option>
                {wizard.allFields.map((f) => (
                  <option
                    key={f.reference}
                    value={f.reference}
                    className="bg-surface"
                  >
                    {f.reference}
                  </option>
                ))}
              </select>
            </div>
            {state.columns.length === 0 ? (
              <p className="text-xs text-muted">
                Nenhuma coluna. Adicione campos acima.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event;
                  if (over && active.id !== over.id) {
                    const oldIndex = state.columns.findIndex((_, i) => `col-${i}` === active.id);
                    const newIndex = state.columns.findIndex((_, i) => `col-${i}` === over.id);
                    if (oldIndex !== -1 && newIndex !== -1) {
                      const reordered = [...state.columns];
                      const [moved] = reordered.splice(oldIndex, 1);
                      reordered.splice(newIndex, 0, moved);
                      wizard.setColumns(reordered);
                    }
                  }
                }}
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-muted-foreground">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="w-6 px-1 py-1" />
                        <th className="px-2 py-1 text-left">Campo</th>
                        <th className="px-2 py-1 text-left">Label</th>
                        <th className="px-2 py-1 text-left">Formato</th>
                        <th className="px-2 py-1 text-left">Alinhamento</th>
                        <th />
                      </tr>
                    </thead>
                    <SortableContext
                      items={state.columns.map((_, i) => `col-${i}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody>
                        {state.columns.map((col, i) => (
                          <SortableRow key={i} id={`col-${i}`}>
                            <td className="px-1 py-1 text-center text-muted cursor-grab active:cursor-grabbing">
                              ⠿
                            </td>
                            <td className="px-2 py-1">
                              <span className="rounded bg-surface-light px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {col.field}
                              </span>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={col.header}
                                onChange={(e) =>
                                  wizard.updateColumn(i, { header: e.target.value })
                                }
                                className="w-28 rounded border border-border bg-surface-light px-1.5 py-0.5 text-foreground"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <select
                                value={col.format}
                                onChange={(e) =>
                                  wizard.updateColumn(i, { format: e.target.value as any })
                                }
                                className="rounded border border-border bg-surface-light px-1.5 py-0.5 text-foreground"
                              >
                                <option value="text" className="bg-surface">texto</option>
                                <option value="number" className="bg-surface">número</option>
                                <option value="date" className="bg-surface">data</option>
                                <option value="datetime" className="bg-surface">data/hora</option>
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <select
                                value={col.align}
                                onChange={(e) =>
                                  wizard.updateColumn(i, { align: e.target.value as any })
                                }
                                className="rounded border border-border bg-surface-light px-1.5 py-0.5 text-foreground"
                              >
                                <option value="left" className="bg-surface">←</option>
                                <option value="center" className="bg-surface">↔</option>
                                <option value="right" className="bg-surface">→</option>
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <button
                                onClick={() => wizard.removeColumn(i)}
                                className="text-red-400 hover:text-red-300"
                                title="Remover"
                              >
                                ✕
                              </button>
                            </td>
                          </SortableRow>
                        ))}
                      </tbody>
                    </SortableContext>
                  </table>
                </div>
              </DndContext>
            )}
          </div>

          {/* Sub-tables */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                📑 Sub-tabelas
              </h3>
              <Button
                onClick={() => {
                  const ds = availableSubTableDatasets[0];
                  if (ds) {
                    wizard.addSubTable(
                      ds.alias,
                      ds.catalogItem.name ?? ds.alias,
                    );
                  }
                }}
                disabled={availableSubTableDatasets.length === 0}
                variant="secondary"
                className="text-xs"
              >
                + Adicionar
              </Button>
            </div>
            {state.subTables.length === 0 ? (
              <p className="text-xs text-muted">
                {state.selectedDatasets.length < 2
                  ? "Adicione mais datasets no passo anterior para criar sub-tabelas."
                  : "Clique em '+ Adicionar' para criar a sub-tabela do dataset secundário."}
              </p>
            ) : (
              <div className="space-y-4">
                {state.subTables.map((st) => {
                  const availableFields = getAvailableFieldsForSubTable(st);

                  return (
                    <div
                      key={st.id}
                      className="rounded-lg border border-border bg-black/10 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <input
                          value={st.title}
                          onChange={(e) => {
                            const updated = state.subTables.map((s) =>
                              s.id === st.id
                                ? { ...s, title: e.target.value }
                                : s,
                            );
                            wizard.setField("subTables", updated as any);
                          }}
                          className="rounded border border-border bg-surface-light px-2 py-1 text-sm font-medium text-foreground"
                        />
                        <button
                          onClick={() => wizard.removeSubTable(st.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="mb-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              addFieldToSubTable(st.id, st.sourceAlias, e.target.value);
                            }
                            e.target.value = "";
                          }}
                          className="w-full rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground disabled:opacity-60"
                          defaultValue=""
                          disabled={availableFields.length === 0}
                        >
                          <option value="" className="bg-surface">
                            {availableFields.length === 0
                              ? "Todos os campos adicionados"
                              : "+ Adicionar campo"}
                          </option>
                          {availableFields.map((field) => (
                            <option
                              key={field.reference}
                              value={field.name}
                              className="bg-surface"
                            >
                              {field.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {st.columns.length === 0 ? (
                        <p className="text-xs text-muted">
                          Nenhuma coluna nesta sub-tabela.
                        </p>
                      ) : (
                        <table className="min-w-full text-xs text-muted-foreground">
                          <thead>
                            <tr className="border-b border-border text-muted">
                              <th className="px-1 py-1 text-left">Campo</th>
                              <th className="px-1 py-1 text-left">Label</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {st.columns.map((col, ci) => (
                              <tr key={ci} className="border-b border-border">
                                <td className="px-1 py-1">
                                  <span className="text-[11px] text-muted">
                                    {normalizeSubTableField(col.field, st.sourceAlias)}
                                  </span>
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    value={col.header}
                                    onChange={(e) => {
                                      const updated = state.subTables.map((s) =>
                                        s.id === st.id
                                          ? {
                                              ...s,
                                              columns: s.columns.map((c, j) =>
                                                j === ci
                                                  ? {
                                                      ...c,
                                                      header: e.target.value,
                                                    }
                                                  : c,
                                              ),
                                            }
                                          : s,
                                      );
                                      wizard.setField("subTables", updated as any);
                                    }}
                                    className="w-24 rounded border border-border bg-surface-light px-1.5 py-0.5 text-foreground"
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <button
                                    onClick={() => {
                                      const updated = state.subTables.map((s) =>
                                        s.id === st.id
                                          ? {
                                              ...s,
                                              columns: s.columns.filter(
                                                (_, j) => j !== ci,
                                              ),
                                            }
                                          : s,
                                      );
                                      wizard.setField("subTables", updated as any);
                                    }}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-200">
            👁 Preview ao vivo
          </h3>
          <LiveMarkdownPreview wizard={wizard} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button onClick={onBack} variant="secondary">
          ← Voltar
        </Button>
        <Button onClick={onNext} variant="primary">
          Próximo: Metadados →
        </Button>
      </div>
    </div>
  );
}

/** Draggable table row wrapper for @dnd-kit */
function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes} {...listeners} className="border-b border-border">
      {children}
    </tr>
  );
}
