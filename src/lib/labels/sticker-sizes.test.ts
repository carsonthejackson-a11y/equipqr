import { describe, expect, it } from "vitest";
import {
  DEFAULT_STICKER_SIZE_ID,
  STICKER_PRINT_RESET,
  STICKER_SIZES,
  STICKER_SIZE_LIST,
  appHost,
  getStickerSize,
  isStickerSizeId,
  stickerPageCss,
} from "./sticker-sizes";

describe("sticker sizes", () => {
  it("defaults to the 2in square", () => {
    expect(DEFAULT_STICKER_SIZE_ID).toBe("2x2");
    expect(getStickerSize(undefined).id).toBe("2x2");
    expect(getStickerSize("nonsense").id).toBe("2x2");
    expect(getStickerSize(null).id).toBe("2x2");
  });

  it("resolves known ids", () => {
    expect(getStickerSize("3x2").id).toBe("3x2");
    expect(getStickerSize("1x1").id).toBe("1x1");
    expect(isStickerSizeId("1x1")).toBe(true);
    expect(isStickerSizeId("4x6")).toBe(false);
  });

  it("names each size after its real dimensions", () => {
    expect(STICKER_SIZES["3x2"].widthIn).toBe(3);
    expect(STICKER_SIZES["3x2"].heightIn).toBe(2);
    expect(STICKER_SIZES["1x1"].widthIn).toBe(1);
    expect(STICKER_SIZES["1x1"].heightIn).toBe(1);
  });

  it("keeps every QR inside its sticker with room to spare", () => {
    for (const size of STICKER_SIZE_LIST) {
      expect(size.qrIn).toBeGreaterThan(0);
      expect(size.qrIn).toBeLessThan(Math.min(size.widthIn, size.heightIn));
    }
  });

  it("only strips the layout down on the 1in square", () => {
    expect(STICKER_SIZES["1x1"].layout).toBe("minimal");
    expect(STICKER_SIZES["2x2"].layout).toBe("full");
    expect(STICKER_SIZES["3x2"].layout).toBe("full");
  });
});

describe("stickerPageCss", () => {
  it("emits a zero-margin @page rule at the sticker's size", () => {
    expect(stickerPageCss(STICKER_SIZES["3x2"])).toContain("@page { size: 3in 2in; margin: 0; }");
    expect(stickerPageCss(STICKER_SIZES["1x1"])).toContain("size: 1in 1in");
  });

  it("also clears the dashboard shell's print padding", () => {
    expect(stickerPageCss(STICKER_SIZES["2x2"])).toContain(STICKER_PRINT_RESET);
  });
});

describe("appHost", () => {
  it("takes the host out of an app URL", () => {
    expect(appHost("https://equipqr.co")).toBe("equipqr.co");
    expect(appHost("https://app.equipqr.co/dashboard")).toBe("app.equipqr.co");
    expect(appHost("http://localhost:3000")).toBe("localhost:3000");
  });

  it("drops a www. prefix", () => {
    expect(appHost("https://www.equipqr.co")).toBe("equipqr.co");
  });

  it("degrades gracefully on an unparseable value", () => {
    expect(appHost("equipqr.co/x")).toBe("equipqr.co");
    expect(appHost("")).toBe("");
  });
});
