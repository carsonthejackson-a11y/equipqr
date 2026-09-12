import { describe, expect, it } from "vitest";
import { VOCAB, vocabFor } from "./vocab";
import type { CompanyKind } from "./types";

const KINDS: CompanyKind[] = ["service_provider", "equipment_owner"];
const FIELDS = [
  "requestSingular",
  "requestPlural",
  "requestsNavLabel",
  "requestsHref",
  "counterpartySingular",
  "counterpartyPlural",
  "counterpartyHref",
  "reporterNoun",
  "assigneeNoun",
  "siteSingular",
  "sitePlural",
  "newRequestVerb",
] as const;

describe("VOCAB", () => {
  it("has both kinds fully populated", () => {
    for (const kind of KINDS) {
      const vocab = VOCAB[kind];
      expect(vocab).toBeDefined();
      for (const field of FIELDS) {
        expect(vocab[field]).toBeDefined();
      }
    }
  });

  it("has no empty string in any field, for either kind", () => {
    for (const kind of KINDS) {
      const vocab = VOCAB[kind];
      for (const field of FIELDS) {
        expect(vocab[field]).not.toBe("");
        expect(vocab[field].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("vocabFor", () => {
  it("falls back to service_provider for null", () => {
    expect(vocabFor(null)).toEqual(VOCAB.service_provider);
  });

  it("falls back to service_provider for undefined", () => {
    expect(vocabFor(undefined)).toEqual(VOCAB.service_provider);
  });

  it("returns the matching vocab for equipment_owner", () => {
    expect(vocabFor("equipment_owner")).toEqual(VOCAB.equipment_owner);
  });

  it("returns the matching vocab for service_provider", () => {
    expect(vocabFor("service_provider")).toEqual(VOCAB.service_provider);
  });
});
