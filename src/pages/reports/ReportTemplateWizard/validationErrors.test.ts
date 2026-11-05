import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import {
  describeValidationField,
  extractValidationErrors,
} from "./validationErrors";

describe("extractValidationErrors", () => {
  it("USA A LISTA ESTRUTURADA do ApiError quando ela existe", () => {
    // Caminho normal da fatia I: nada de split por "; ".
    const error = new ApiError(
      400,
      "layoutJson: campo inexistente.; dataSources[1].join.sourceKey: obrigatoria.",
      [
        {
          code: "Validation",
          field: "layoutJson",
          message: "campo inexistente.",
        },
        {
          code: "Validation",
          field: "dataSources[1].join.sourceKey",
          message: "obrigatoria.",
        },
      ],
    );

    const errors = extractValidationErrors(error);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      message: "campo inexistente.",
      field: "layoutJson",
      code: "Validation",
    });
    expect(errors[1].field).toBe("dataSources[1].join.sourceKey");
  });

  it("preserva mensagem que contem '; ' quando vem estruturada", () => {
    // O bug que a fatia fecha: pelo caminho achatado isto viraria 2 linhas.
    const mensagem = "nao casou nenhuma linha; verifique o agente.";
    const error = new ApiError(400, `layoutJson: ${mensagem}`, [
      { field: "layoutJson", message: mensagem },
    ]);

    const errors = extractValidationErrors(error);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(mensagem);
  });

  it("cai no fallback por '; ' quando NAO ha lista estruturada", () => {
    // Compatibilidade: erro antigo, sem ApiError.errors.
    const error = new ApiError(
      400,
      "layoutJson: primeiro erro.; dataSources[1].join.sourceKey: segundo erro.",
    );

    const errors = extractValidationErrors(error);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      field: "layoutJson",
      message: "primeiro erro.",
    });
    expect(errors[1].field).toBe("dataSources[1].join.sourceKey");
  });

  it("aceita lista estruturada em objeto cru (sem passar pelo client)", () => {
    const errors = extractValidationErrors({
      errors: [{ code: "C", field: "F", message: "M" }],
    });
    expect(errors).toEqual([{ code: "C", field: "F", message: "M" }]);
  });

  it("aceita PascalCase (shape cru do .NET)", () => {
    const errors = extractValidationErrors({
      errors: [{ Code: "C", Field: "F", Message: "M" }],
    });
    expect(errors).toEqual([{ code: "C", field: "F", message: "M" }]);
  });

  it("respeita a prioridade da lista do ApiError sobre um errors cru vazio", () => {
    const error = new ApiError(400, "mensagem achatada", [
      { field: "layoutJson", message: "da lista" },
    ]);
    (error as unknown as { errors: unknown }).errors = [];
    // Sem lista utilizavel, cai no fallback e nao quebra.
    const errors = extractValidationErrors(error);
    expect(errors).toEqual([{ message: "mensagem achatada" }]);
  });

  it("erro sem mensagem nenhuma devolve lista vazia", () => {
    expect(extractValidationErrors(new ApiError(400, "   "))).toEqual([]);
    expect(extractValidationErrors(null)).toEqual([]);
    expect(extractValidationErrors(undefined)).toEqual([]);
  });

  it("describeValidationField ancora layoutJson no contexto de dados", () => {
    expect(describeValidationField("layoutJson")).toBe(
      "Layout do relatório (fontes, colunas e joins)",
    );
    expect(describeValidationField("filtersJson")).toBe("Filtros do relatório");
    expect(describeValidationField("name")).toBe("name");
    expect(describeValidationField(undefined)).toBeUndefined();
  });
});
