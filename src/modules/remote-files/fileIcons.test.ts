import { describe, it, expect } from 'vitest';
import { fileKindOf, extensionOf } from './fileIcons';

describe('extensionOf', () => {
  it('extrai a extensao em minusculas', () => {
    expect(extensionOf('Install.LOG')).toBe('log');
    expect(extensionOf('logs.db')).toBe('db');
  });

  it('retorna vazio quando nao ha extensao', () => {
    expect(extensionOf('sem-extensao')).toBe('');
    expect(extensionOf('nome.')).toBe('');
    expect(extensionOf('.gitignore')).toBe('gitignore');
  });

  it('usa apenas o ultimo segmento', () => {
    expect(extensionOf('backup.tar.gz')).toBe('gz');
    expect(extensionOf('a.b.c')).toBe('c');
  });
});

describe('fileKindOf', () => {
  it('trata diretorios como pasta antes de olhar a extensao', () => {
    expect(fileKindOf('logs.db', true)).toBe('folder');
    expect(fileKindOf('pasta.zip', true)).toBe('folder');
  });

  it('classifica as familias usadas na tela de arquivos remotos', () => {
    expect(fileKindOf('logs.db')).toBe('database');
    expect(fileKindOf('installer.log')).toBe('log');
    expect(fileKindOf('discovery.exe')).toBe('executable');
    expect(fileKindOf('pacote.zip')).toBe('archive');
    expect(fileKindOf('backup.tar.gz')).toBe('archive');
    expect(fileKindOf('relatorio.xlsx')).toBe('sheet');
    expect(fileKindOf('manual.pdf')).toBe('pdf');
    expect(fileKindOf('captura.PNG')).toBe('image');
    expect(fileKindOf('script.ps1')).toBe('code');
    expect(fileKindOf('config.json')).toBe('config');
    expect(fileKindOf('notas.txt')).toBe('text');
    expect(fileKindOf('disco.iso')).toBe('disk');
    expect(fileKindOf('library.dll')).toBe('executable');
    expect(fileKindOf('fonte.ttf')).toBe('font');
  });

  it('trata dotfiles como configuracao e desconhecidos como arquivo', () => {
    expect(fileKindOf('.gitignore')).toBe('config');
    expect(fileKindOf('.env')).toBe('config');
    expect(fileKindOf('arquivo.xyz')).toBe('file');
    expect(fileKindOf('sem-extensao')).toBe('file');
    expect(fileKindOf('nome.')).toBe('file');
    expect(fileKindOf('')).toBe('file');
  });

  it('nao confunde arquivos com nome parecido de pasta', () => {
    expect(fileKindOf('relatorios')).toBe('file');
    expect(fileKindOf('C:\\Windows\\System32')).toBe('file');
  });
});
