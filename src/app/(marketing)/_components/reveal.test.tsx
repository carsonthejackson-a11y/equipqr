import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Reveal } from "./reveal";

// BRIEF D6: scroll reveal must never hide server-rendered content. The hidden
// state is only ever applied in a client effect, so the SSR markup carries the
// bare `data-reveal` hook and nothing else.
describe("Reveal (server render)", () => {
  it("renders children visible with no hidden state", () => {
    const html = renderToString(
      <Reveal>
        <p>Scan the tag.</p>
      </Reveal>
    );
    expect(html).toContain("<p>Scan the tag.</p>");
    expect(html).toContain('data-reveal=""');
    expect(html).not.toContain('data-reveal="hidden"');
  });

  it("carries the delay as a custom property and honours `as`", () => {
    const html = renderToString(
      <Reveal as="section" delayMs={120} className="hero">
        phone
      </Reveal>
    );
    expect(html).toMatch(/^<section /);
    expect(html).toContain('class="hero"');
    expect(html).toContain("--reveal-delay:120ms");
    expect(html).not.toContain('data-reveal="hidden"');
  });

  it("stays visible when disabled", () => {
    const html = renderToString(<Reveal enabled={false}>copy</Reveal>);
    expect(html).toContain('data-reveal=""');
    expect(html).not.toContain("hidden");
  });
});
