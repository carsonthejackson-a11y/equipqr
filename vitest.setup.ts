import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's automatic afterEach(cleanup) only registers when
// it detects vitest's *global* afterEach; this project runs with
// `globals: false`, so unmount rendered trees between tests explicitly.
afterEach(() => {
  cleanup();
});
