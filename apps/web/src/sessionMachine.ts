export type UiStage =
  | "ready"
  | "recording"
  | "uploading"
  | "processing"
  | "review"
  | "follow_up"
  | "sending"
  | "delivered"
  | "error";

const transitions: Record<UiStage, UiStage[]> = {
  ready: ["recording", "uploading", "error"],
  recording: ["uploading", "ready", "error"],
  uploading: ["processing", "error"],
  processing: ["review", "follow_up", "error"],
  review: ["sending", "ready", "error"],
  follow_up: ["uploading", "ready", "error"],
  sending: ["delivered", "error"],
  delivered: ["ready"],
  error: ["ready", "uploading"]
};

export function transitionUiStage(current: UiStage, next: UiStage) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid UI transition from ${current} to ${next}`);
  }
  return next;
}