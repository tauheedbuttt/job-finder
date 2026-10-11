import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { grant, granted } from "../lib/access";

let held: boolean;
const request = vi.fn(async () => (held = true));

describe("host access", () => {
  beforeEach(() => {
    held = false;
    request.mockClear();
    vi.stubGlobal("browser", {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => held && origins[0] === "<all_urls>",
        request,
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports missing access", async () => {
    expect(await granted()).toBe(false);
  });

  it("requests all urls and reports result", async () => {
    expect(await grant()).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
    expect(await granted()).toBe(true);
  });
});
