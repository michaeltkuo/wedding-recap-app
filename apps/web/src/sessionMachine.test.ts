import { describe, expect, it } from "vitest";

import { transitionUiStage } from "./sessionMachine";

describe("web session machine", () => {
  it("blocks invalid transitions", () => {
    expect(() => transitionUiStage("ready", "delivered")).toThrow(/Invalid UI transition/);
  });

  it("moves a completed capture through review before delivery", () => {
    expect(transitionUiStage("recording", "uploading")).toBe("uploading");
    expect(transitionUiStage("uploading", "processing")).toBe("processing");
    expect(transitionUiStage("processing", "review")).toBe("review");
    expect(transitionUiStage("review", "sending")).toBe("sending");
    expect(transitionUiStage("sending", "delivered")).toBe("delivered");
  });
});