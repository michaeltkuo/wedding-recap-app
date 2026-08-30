import type { SessionStage } from "../contracts.js";

const allowedTransitions: Record<SessionStage, SessionStage[]> = {
  idle: ["recording", "uploading", "transcribing"],
  recording: ["uploading", "error"],
  uploading: ["uploaded", "error"],
  uploaded: ["transcribing", "error"],
  transcribing: ["extracting", "error"],
  extracting: ["follow_up_required", "drafting", "partial", "error"],
  follow_up_required: ["uploading", "transcribing", "error"],
  drafting: ["publishing", "partial", "error"],
  publishing: ["completed", "error"],
  completed: [],
  partial: ["uploading", "publishing", "error"],
  error: ["transcribing", "uploading"]
};

export function canTransition(from: SessionStage, to: SessionStage) {
  return allowedTransitions[from].includes(to);
}

export function transitionStage(current: SessionStage, next: SessionStage) {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid stage transition from ${current} to ${next}`);
  }

  return next;
}