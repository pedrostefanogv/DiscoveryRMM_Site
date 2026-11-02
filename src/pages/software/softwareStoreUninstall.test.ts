import { describe, expect, it } from 'vitest';

import { uninstallCommandNeedsInstaller } from './softwareStoreUtils';

/**
 * O agent só baixa/extrai o instalador na DESINSTALAÇÃO quando o comando
 * referencia os tokens do instalador publicado. A UI usa o mesmo critério para
 * avisar sobre o re-download — os casos aqui espelham os testes do agent.
 */
describe('uninstallCommandNeedsInstaller', () => {
  it('comando com caminho absoluto não referencia o instalador', () => {
    expect(
      uninstallCommandNeedsInstaller(
        '"C:\\Program Files\\Foxit Software\\Foxit PDF Editor\\uninstall.exe" /quiet',
      ),
    ).toBe(false);
  });

  it('{{installerDir}} indica download extra', () => {
    expect(uninstallCommandNeedsInstaller('{{installerDir}}\\uninstall.exe /S')).toBe(true);
  });

  it('{{installer}} indica download extra', () => {
    expect(uninstallCommandNeedsInstaller('{{installer}} /uninstall')).toBe(true);
  });

  it('%INSTALLER% indica download extra', () => {
    expect(uninstallCommandNeedsInstaller('%INSTALLER% /uninstall')).toBe(true);
  });

  it('%INSTALLER_DIR% indica download extra', () => {
    expect(uninstallCommandNeedsInstaller('msiexec /x "%INSTALLER_DIR%\\app.msi"')).toBe(true);
  });

  it('é case-sensitive como no agent (tokens em minúsculas não contam)', () => {
    expect(uninstallCommandNeedsInstaller('%installer_dir% /uninstall')).toBe(false);
    expect(uninstallCommandNeedsInstaller('{{INSTALLER}} /x')).toBe(false);
  });

  it('string vazia não referencia o instalador', () => {
    expect(uninstallCommandNeedsInstaller('')).toBe(false);
  });
});
