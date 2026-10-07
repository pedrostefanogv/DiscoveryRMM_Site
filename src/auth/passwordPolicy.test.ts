import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  listPasswordViolations,
  validatePassword,
} from "./passwordPolicy";

describe("passwordPolicy", () => {
  it("exige o mesmo mínimo do backend (12 caracteres)", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(validatePassword("Abcdef1!")).toMatch(/12 caracteres/);
  });

  it("exige maiúscula, número e caractere especial", () => {
    const violations = listPasswordViolations("senha");
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.join(" ")).toMatch(/maiúscula/);
    expect(violations.join(" ")).toMatch(/número/);
    expect(violations.join(" ")).toMatch(/especial/);
  });

  it("aceita uma senha conforme a política", () => {
    expect(validatePassword("SenhaForte#2026")).toBeNull();
    expect(listPasswordViolations("SenhaForte#2026")).toEqual([]);
  });

  it("expõe as regras para exibição na UI", () => {
    expect(PASSWORD_RULES).toHaveLength(4);
  });
});
