import { describe, expect, it } from "vitest";
import { normalizeFileScope, normalizeFileSource, normalizeFileVisibility } from "./files";

describe("files enum normalizers", () => {
  it("normalizes FileScope from strings and numbers", () => {
    expect(normalizeFileScope("Global")).toBe(0);
    expect(normalizeFileScope("Client")).toBe(1);
    expect(normalizeFileScope("Site")).toBe(2);
    expect(normalizeFileScope(1)).toBe(1);
    expect(normalizeFileScope(2)).toBe(2);
    expect(normalizeFileScope(undefined)).toBe(0);
  });

  it("normalizes FileVisibility from strings and numbers", () => {
    expect(normalizeFileVisibility("Private")).toBe(0);
    expect(normalizeFileVisibility("AgentOnly")).toBe(1);
    expect(normalizeFileVisibility("Public")).toBe(2);
    expect(normalizeFileVisibility("PublicWebOnly")).toBe(3);
    expect(normalizeFileVisibility(2)).toBe(2);
    expect(normalizeFileVisibility(3)).toBe(3);
    expect(normalizeFileVisibility(undefined)).toBe(0);
  });

  it("normalizes FileSource from strings and numbers", () => {
    expect(normalizeFileSource("AdminUpload")).toBe(0);
    expect(normalizeFileSource("ClientUploadLink")).toBe(1);
    expect(normalizeFileSource(1)).toBe(1);
  });
});
