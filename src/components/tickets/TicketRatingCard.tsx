import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Button, Card, CardHeader, TextArea } from '@/components/ui';
import { useRateTicket } from '@/hooks/useTickets';
import type { Ticket } from '@/api';
import toast from 'react-hot-toast';

/**
 * Avaliação (CSAT) do chamado. Só existe depois do encerramento: mostra o
 * resultado quando já avaliado e o formulário quando ainda não há nota
 * (normalmente quem avalia é quem abriu o chamado, pelo chat do agent).
 */
export function TicketRatingCard({ ticket }: { ticket: Ticket }) {
  const rate = useRateTicket();
  const [value, setValue] = useState(ticket.rating ?? 0);
  const [feedback, setFeedback] = useState(ticket.ratingFeedback ?? '');

  useEffect(() => {
    setValue(ticket.rating ?? 0);
    setFeedback(ticket.ratingFeedback ?? '');
  }, [ticket.id, ticket.rating, ticket.ratingFeedback]);

  // Sem encerramento não há avaliação a mostrar.
  if (!ticket.closedAt) return null;

  const rated = Boolean(ticket.rating);
  const stars = (count: number) => (
    <div className="flex items-center gap-1" role={rated ? 'img' : 'radiogroup'} aria-label="Nota da avaliação">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className="p-0.5">
          <Star className={star <= count ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5 text-muted'} />
        </span>
      ))}
    </div>
  );

  const submit = (rating: number) => {
    if (rating < 1) return;
    rate.mutate(
      { id: ticket.id, data: { rating, feedback: feedback.trim() || null } },
      {
        onSuccess: () => toast.success('Avaliação registrada'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao avaliar o chamado'),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Avaliação (CSAT)"
        subtitle={rated ? 'Resultado registrado após o encerramento' : 'Chamado encerrado — avalie o atendimento'}
      />

      {rated ? (
        <div className="space-y-3">
          {stars(ticket.rating ?? 0)}
          <p className="text-sm text-foreground">
            {ticket.ratingFeedback?.trim() ? ticket.ratingFeedback : 'Sem comentário.'}
          </p>
          <p className="text-xs text-muted">
            Avaliado em {ticket.ratedAt ? new Date(ticket.ratedAt).toLocaleString('pt-BR') : '—'}
            {ticket.ratedBy ? ` por ${ticket.ratedBy}` : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Normalmente quem avalia é quem abriu o chamado (pelo chat do agent). Registre aqui se necessário.
          </p>
          <div role="radiogroup" aria-label="Nota da avaliação" className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={star + ' estrela(s)'}
                onClick={() => setValue(star)}
                className="p-0.5"
              >
                <Star className={star <= value ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5 text-muted'} />
              </button>
            ))}
          </div>
          <TextArea
            placeholder="Feedback (opcional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <Button size="sm" onClick={() => submit(value)} loading={rate.isPending} disabled={value < 1}>
            Salvar avaliação
          </Button>
        </div>
      )}
    </Card>
  );
}
