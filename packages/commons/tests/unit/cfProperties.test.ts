import { describe, it, expect } from "vitest";
import { extractCfProperties } from "../../src/cfProperties";

describe("extractCfProperties", () => {
  it("returns an empty object when no cf property exists", () => {
    const request = new Request("https://example.com");
    expect(extractCfProperties(request)).toEqual({});
  });

  it.todo("returns colo, country, and asn from cf object");
  it.todo("omits undefined fields from the result");
  it.todo("returns city, region, and timezone when present");
});
