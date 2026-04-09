import { describe, it, expect } from "vitest";
import { PowertoolsBase } from "../../src/powertoolsBase";

// Concrete subclass for testing the abstract base
class TestUtil extends PowertoolsBase {
  getServiceName() {
    return this.serviceName;
  }
  getDevMode() {
    return this.devMode;
  }
  testResolveConfig<T>(
    explicit: T | undefined,
    env: string | undefined,
    fallback: T,
    parser?: (raw: string) => T,
  ) {
    return this.resolveConfig(explicit, env, fallback, parser);
  }
}

describe("PowertoolsBase", () => {
  describe("constructor", () => {
    it("uses provided serviceName", () => {
      const util = new TestUtil({ serviceName: "my-service" });
      expect(util.getServiceName()).toBe("my-service");
    });

    it("defaults serviceName to 'service_undefined'", () => {
      const util = new TestUtil();
      expect(util.getServiceName()).toBe("service_undefined");
    });

    it("defaults devMode to false", () => {
      const util = new TestUtil();
      expect(util.getDevMode()).toBe(false);
    });

    it("respects devMode: true", () => {
      const util = new TestUtil({ devMode: true });
      expect(util.getDevMode()).toBe(true);
    });
  });

  describe("resolveConfig", () => {
    it("returns explicit value when provided", () => {
      const util = new TestUtil();
      expect(util.testResolveConfig("explicit", "env-val", "default")).toBe("explicit");
    });

    it("returns parsed env value when no explicit value", () => {
      const util = new TestUtil();
      expect(util.testResolveConfig(undefined, "42", 0, (v) => parseInt(v, 10))).toBe(42);
    });

    it("returns default when both explicit and env are absent", () => {
      const util = new TestUtil();
      expect(util.testResolveConfig(undefined, undefined, "default")).toBe("default");
    });

    it.todo("returns default when env value is an empty string");
  });
});
