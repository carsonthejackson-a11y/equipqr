import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/format";

describe("formatBytes", () => {
  it("keeps small sizes in plain bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("steps up a unit at 1024", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
  });

  it("drops the decimal once the number is big enough not to need it", () => {
    expect(formatBytes(1024 * 9.5)).toBe("9.5 KB");
    expect(formatBytes(1024 * 10.4)).toBe("10 KB");
  });

  it("stays on the largest unit rather than inventing one", () => {
    expect(formatBytes(5 * 1024 ** 5)).toBe("5120 TB");
  });

  it("renders unknown sizes as a dash", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});
