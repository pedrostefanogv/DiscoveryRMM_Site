import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOB_DOWNLOAD_REVOKE_MS, isImageAttachment, triggerBlobDownload } from './chatAttachment';

describe('isImageAttachment', () => {
  it('trata os tipos de imagem que o navegador renderiza como imagem', () => {
    expect(isImageAttachment('image/png', 'print.png')).toBe(true);
    expect(isImageAttachment('IMAGE/JPEG', 'foto.jpg')).toBe(true);
    expect(isImageAttachment('image/webp', 'x.webp')).toBe(true);
    expect(isImageAttachment('image/svg+xml', 'icone.svg')).toBe(true);
    expect(isImageAttachment('image/svg+xml; charset=utf-8', 'icone.svg')).toBe(true);
  });

  it('NÃO trata PDF como imagem (o caso do Certificado.pdf no chat)', () => {
    // Sintoma original: o PDF ia para o lightbox de <img>, não renderizava e
    // sobrava só o texto do alt no centro da tela escura.
    expect(isImageAttachment('application/pdf', 'Certificado.pdf')).toBe(false);
    expect(isImageAttachment('application/pdf', 'Certificado.PDF')).toBe(false);
  });

  it('não trata outros tipos comuns como imagem', () => {
    expect(isImageAttachment('text/plain', 'agent.log')).toBe(false);
    expect(isImageAttachment('text/csv', 'dados.csv')).toBe(false);
    expect(isImageAttachment('application/zip', 'evidencias.zip')).toBe(false);
    expect(isImageAttachment('application/x-7z-compressed', 'x.7z')).toBe(false);
    expect(isImageAttachment('application/x-msdownload', 'setup.exe')).toBe(false);
    expect(isImageAttachment('application/octet-stream', 'desconhecido.bin')).toBe(false);
    expect(isImageAttachment(null, 'arquivo')).toBe(false);
  });

  it('trata a família image/* NÃO renderizável como download', () => {
    // `image/*` não basta: TIFF/HEIC/JXL estão na família mas não renderizam no
    // console — abririam o mesmo vazio do PDF, só com outro MIME.
    expect(isImageAttachment('image/tiff', 'digitalizado.tiff')).toBe(false);
    expect(isImageAttachment('image/heic', 'foto.heic')).toBe(false);
    expect(isImageAttachment('image/jxl', 'foto.jxl')).toBe(false);
  });

  it('usa a extensão quando o tipo não veio (octet-stream)', () => {
    expect(isImageAttachment('application/octet-stream', 'print.PNG')).toBe(true);
    expect(isImageAttachment('', 'foto.jpeg')).toBe(true);
    expect(isImageAttachment('application/octet-stream', 'Certificado.pdf')).toBe(false);
    expect(isImageAttachment('application/octet-stream', 'evidencias.zip')).toBe(false);
    expect(isImageAttachment('application/octet-stream', 'scan.tiff')).toBe(false);
  });

  it('prefere o contentType quando ele é informativo', () => {
    // Tipo explícito que não é imagem manda, mesmo com extensão de imagem.
    expect(isImageAttachment('application/pdf', 'falso.png')).toBe(false);
  });
});

describe('triggerBlobDownload', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispara o download com o nome original do arquivo', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    triggerBlobDownload(new Blob(['conteudo'], { type: 'application/pdf' }), 'Certificado.pdf');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('Certificado.pdf');
    expect(clicked[0].href).toContain('blob:fake-url');
    // O anchor não pode ficar pendurado no DOM.
    expect(document.querySelectorAll('a')).toHaveLength(0);
    // A revogação é ADIADA: revogar no mesmo tick cancela o download em alguns
    // navegadores (o blob é interrompido no meio da leitura).
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BLOB_DOWNLOAD_REVOKE_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('cai num nome padrão quando o anexo não tem nome', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:x') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    triggerBlobDownload(new Blob(['x']), '');

    expect(clicked[0].download).toBe('anexo');
  });
});
