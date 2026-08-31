import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownDescriptionProps {
  content?: string | null;
  variant?: 'preview' | 'full';
  emptyText?: string;
}

export function MarkdownDescription({
  content,
  variant = 'preview',
  emptyText,
}: MarkdownDescriptionProps) {
  const normalized = content?.trim() ?? '';

  if (!normalized) {
    return emptyText ? (
      <p className={variant === 'full' ? 'text-sm text-muted-foreground' : 'text-xs text-muted'}>
        {emptyText}
      </p>
    ) : null;
  }

  const baseClass =
    '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic '
    + '[&_code]:rounded [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-2 '
    + '[&_p]:m-0 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 '
    + '[&_h1]:m-0 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:m-0 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground '
    + '[&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-2 [&_hr]:border-border [&_img]:hidden '
    + 'min-w-0 max-w-full overflow-x-hidden break-words [&_p]:break-words [&_*]:break-words [&_*]:overflow-wrap-anywhere';

  const variantClass =
    variant === 'full'
      ? 'text-sm leading-relaxed text-muted-foreground'
      : 'max-h-16 overflow-hidden text-xs leading-relaxed text-muted [mask-image:linear-gradient(to_bottom,black_70%,transparent)]';

  return (
    <article className={`${baseClass} ${variantClass}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {normalized}
      </ReactMarkdown>
    </article>
  );
}
