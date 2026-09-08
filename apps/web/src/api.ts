import type { GoogleAuthStatus, PipelineStartRequest, SessionResult, SignUploadRequest, SignUploadResponse } from "@wedding/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
const CONTRACTOR_TOKEN = "demo-contractor-token";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
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
  return apiRequest<SignUploadResponse>("/api/uploads/sign-url", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadAudio(uploadUrl: string, audio: Blob) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    credentials: "include",
    headers: {
      "content-type": audio.type || "audio/webm",
      "x-contractor-token": CONTRACTOR_TOKEN
    },
    body: audio
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Audio upload failed" }));
    throw new Error(errorBody.error ?? "Audio upload failed");
  }

  return response.json() as Promise<{ accepted: boolean; sessionId: string }>;
}

export async function startPipeline(payload: PipelineStartRequest) {
  return apiRequest<{ accepted: boolean; sessionId: string }>("/api/transcriptions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function publishSession(sessionId: string) {
  return apiRequest<{ status: "normal" | "queued"; googleDoc: { url: string; status: "ready" | "queued" | "failed" } }>(
    "/api/docs/publish",
    {
      method: "POST",
      body: JSON.stringify({ sessionId, publishMode: "normal" })
    }
  );
}

export async function getSession(sessionId: string) {
  return apiRequest<SessionResult>(`/api/sessions/${sessionId}`);
}

export async function getGoogleAuthStatus() {
  return apiRequest<GoogleAuthStatus>("/api/auth/google/status");
}

export function getGoogleAuthStartUrl() {
  return `${API_BASE_URL}/api/auth/google/start`;
}