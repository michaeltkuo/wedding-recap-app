import { describe, expect, it } from "vitest";

import { canPublish, transitionUiStage } from "./sessionMachine";

describe("web session machine", () => {
  it("blocks invalid transitions", () => {
    expect(() => transitionUiStage("idle", "completed")).toThrow(/Invalid UI transition/);
  });

  it("requires every editor checklist item before publish", () => {
    expect(
      canPublish({
        factualAccuracy: true,
        brandVoice: true,
        seoStructure: true,
        imageSlugs: false,
        noOpenGaps: true
      })
    ).toBe(false);
  });
});