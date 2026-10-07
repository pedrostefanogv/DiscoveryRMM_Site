import type { CSSProperties } from 'react';
import type { CompletionMatch } from './terminalInput';

interface CompletionPopupProps {
    matches: CompletionMatch[];
    selectedIndex: number;
    totalCount: number;
    page: number;
    hasMore: boolean;
    /** Posição absoluta (fixed) calculada a partir do cursor do xterm. */
    style: CSSProperties;
    onHover: (index: number) => void;
    onSelect: (index: number) => void;
}

/**
 * Listbox de completions exibido ACIMA da linha do cursor. A navegação por
 * teclado (setas/Tab/Enter/Esc) é tratada no RemoteTerminal; aqui só o desenho
 * e o clique. Não captura o foco: o xterm continua recebendo as teclas.
 */
export default function CompletionPopup({
    matches,
    selectedIndex,
    totalCount,
    page,
    hasMore,
    style,
    onHover,
    onSelect,
}: CompletionPopupProps) {
    return (
        <div
            role="listbox"
            aria-label="Completions"
            data-testid="terminal-completion-popup"
            className="fixed z-50 max-h-40 w-72 overflow-y-auto rounded border border-border-strong bg-surface text-xs text-foreground shadow-lg"
            style={style}
            // O popup não rouba o foco do xterm (senão as setas/Tab param de
            // chegar ao handler de teclado).
            onMouseDown={(event) => event.preventDefault()}
        >
            <div className="flex items-center justify-between border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                <span>{totalCount} sugestões</span>
                <span>
                    pág. {page + 1}
                    {hasMore ? '+' : ''}
                </span>
            </div>
            {matches.length === 0 ? (
                <div className="px-2 py-1.5 text-muted-foreground">(sem sugestões)</div>
            ) : (
                matches.map((match, index) => (
                    <div
                        key={`${match.listItem ?? match.text}-${index}`}
                        role="option"
                        aria-selected={index === selectedIndex}
                        data-testid={`terminal-completion-option-${index}`}
                        className={
                            index === selectedIndex
                                ? 'cursor-pointer truncate bg-surface-hover px-2 py-1'
                                : 'cursor-pointer truncate px-2 py-1'
                        }
                        onMouseEnter={() => onHover(index)}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            onSelect(index);
                        }}
                        title={match.tooltip ?? match.listItem ?? match.text}
                    >
                        {match.listItem ?? match.text}
                        {match.type ? (
                            <span className="ml-2 text-[10px] text-muted-foreground">{match.type}</span>
                        ) : null}
                    </div>
                ))
            )}
        </div>
    );
}
