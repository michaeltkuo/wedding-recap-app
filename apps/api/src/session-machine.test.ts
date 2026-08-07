import { describe, expect, it } from "vitest";

import { canTransition, transitionStage } from "./lib/session-machine.js";

describe("session machine", () => {
  it("allows follow-up loops back into transcription", () => {
    expect(canTransition("follow_up_required", "transcribing")).toBe(true);
  });

  it("rejects impossible transitions", () => {
    expect(() => transitionStage("idle", "completed")).toThrow(/Invalid stage transition/);
  });
});