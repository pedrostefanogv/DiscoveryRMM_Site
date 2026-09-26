import { describe, expect, it } from "vitest";
import { CustomFieldDataType, type TicketSchemaField } from "@/api/custom-fields";
import {
  draftFromCustomFieldValue,
  templateDefaultsToDrafts,
} from "./ticketTemplateDefaults";

function field(
  definitionId: string,
  dataType: CustomFieldDataType,
  overrides: Partial<TicketSchemaField> = {},
): TicketSchemaField {
  return {
    definitionId,
    name: definitionId,
    label: definitionId,
    description: null,
    dataType,
    isRequired: false,
    isInternal: false,
    isActive: true,
    options: [],
    validationRegex: null,
    inputMask: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    currentValueJson: null,
    ...overrides,
  };
}

describe("draftFromCustomFieldValue", () => {
  it("converte boolean, lista e texto", () => {
    expect(draftFromCustomFieldValue(CustomFieldDataType.Boolean, true)).toBe("true");
    expect(draftFromCustomFieldValue(CustomFieldDataType.Boolean, false)).toBe("false");
    expect(
      draftFromCustomFieldValue(CustomFieldDataType.ListBox, ["A", "B"]),
    ).toBe("A, B");
    expect(draftFromCustomFieldValue(CustomFieldDataType.Text, "abc")).toBe("abc");
    expect(draftFromCustomFieldValue(CustomFieldDataType.Integer, 42)).toBe("42");
  });
});

describe("templateDefaultsToDrafts", () => {
  const fields = [
    field("11111111-1111-1111-1111-111111111111", CustomFieldDataType.Text),
    field("22222222-2222-2222-2222-222222222222", CustomFieldDataType.Boolean),
    field("33333333-3333-3333-3333-333333333333", CustomFieldDataType.ListBox),
  ];

  it("mapeia apenas campos presentes no schema", () => {
    const json = JSON.stringify({
      "11111111-1111-1111-1111-111111111111": "suporte",
      "22222222-2222-2222-2222-222222222222": true,
      "99999999-9999-9999-9999-999999999999": "ignorado",
    });
    const drafts = templateDefaultsToDrafts(json, fields);
    expect(drafts).toEqual({
      "11111111-1111-1111-1111-111111111111": "suporte",
      "22222222-2222-2222-2222-222222222222": "true",
    });
  });

  it("omite vazios e campos inativos e tolera JSON inválido", () => {
    expect(templateDefaultsToDrafts("{}", fields)).toEqual({});
    expect(templateDefaultsToDrafts("{invalido", fields)).toEqual({});
    expect(templateDefaultsToDrafts(null, fields)).toEqual({});
    expect(
      templateDefaultsToDrafts(
        JSON.stringify({ "11111111-1111-1111-1111-111111111111": "  " }),
        fields,
      ),
    ).toEqual({});
  });
});
