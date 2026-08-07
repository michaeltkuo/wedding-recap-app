export type UiStage =
  | "idle"
  | "recording"
  | "uploading"
  | "processing"
  | "follow_up_required"
  | "completed"
  | "partial"
  | "error";

const transitions: Record<UiStage, UiStage[]> = {
  idle: ["recording", "uploading", "error"],
  recording: ["uploading", "idle", "error"],
  uploading: ["processing", "error"],
  processing: ["follow_up_required", "completed", "partial", "error"],
  follow_up_required: ["uploading", "error"],
  completed: ["idle"],
  partial: ["uploading", "error"],
  error: ["idle", "uploading"]
};

export type ApprovalChecklist = {
  factualAccuracy: boolean;
  brandVoice: boolean;
  seoStructure: boolean;
  imageSlugs: boolean;
  noOpenGaps: boolean;
};

export function transitionUiStage(current: UiStage, next: UiStage) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid UI transition from ${current} to ${next}`);
  }
  return next;
}

export function canPublish(checklist: ApprovalChecklist) {
  return Object.values(checklist).every(Boolean);
}