import type { PipelineStartRequest, SessionEvent, SessionResult, SignUploadRequest } from "@wedding/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
const CONTRACTOR_TOKEN = "demo-contractor-token";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-contractor-token": CONTRACTOR_TOKEN,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Unknown API error" }));
    throw new Error(errorBody.error ?? "Unknown API error");
  }

  return response.json() as Promise<T>;
}

export async function createSession() {
  return apiRequest<{ sessionId: string }>("/api/sessions", { method: "POST" });
}

export async function signUpload(payload: SignUploadRequest) {
  return apiRequest<{ uploadToken: string; uploadUrl: string }>("/api/uploads/sign-url", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadAudio(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-contractor-token": CONTRACTOR_TOKEN,
      "content-type": file.type
    },
    body: file
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(errorBody.error ?? "Upload failed");
  }

  return response.json() as Promise<{ stored: boolean; objectKey: string }>;
}

export async function startPipeline(payload: PipelineStartRequest) {
  return apiRequest<{ accepted: boolean; sessionId: string }>("/api/transcriptions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getSession(sessionId: string) {
  return apiRequest<SessionResult>(`/api/sessions/${sessionId}`);
}

export async function getTimeline(sessionId: string) {
  return apiRequest<{ sessionId: string; events: SessionEvent[] }>(`/api/sessions/${sessionId}/timeline`);
}