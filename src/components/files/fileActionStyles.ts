/**
 * Classes canônicas das ações de tabela da área de Arquivos.
 *
 * Existem num módulo próprio porque a área tinha TRÊS padrões divergentes:
 * a aba Arquivos da Central usava botões com contorno, enquanto as abas de
 * Links de Download/Upload (na Central e no ScopedFilesTab) usavam texto
 * sublinhado — e o ScopedFilesTab ainda tinha uma terceira variação, sem os
 * tons de dark mode. Centralizar aqui garante que qualquer aba nova já nasça
 * com o mesmo visual.
 */
export const FILE_ACTION_BTN =
  "px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200";

export const FILE_ACTION_BTN_PRIMARY =
  "px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800/70 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 text-xs font-medium text-blue-700 dark:text-blue-300";

export const FILE_ACTION_BTN_DANGER =
  "px-2 py-1 rounded-lg border border-red-200 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950/50 text-xs font-medium text-red-600 dark:text-red-400";
