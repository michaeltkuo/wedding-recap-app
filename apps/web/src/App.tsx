import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionEvent, SessionResult } from "@wedding/contracts";

import type { GoogleAuthStatus } from "./api";
import { createSession, getGoogleAuthStartUrl, getGoogleAuthStatus, getSession, getTimeline, signUpload, startPipeline, uploadAudio } from "./api";
import { canPublish, transitionUiStage, type ApprovalChecklist, type UiStage } from "./sessionMachine";

const allowedMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]);
const preferredRecordingMimeTypes = ["audio/webm", "audio/mp4"] as const;

function pickSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  return preferredRecordingMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "audio/mp4":
      return "mp4";
    case "audio/webm":
    default:
      return "webm";
  }
}

const defaultChecklist: ApprovalChecklist = {
  factualAccuracy: true,
  brandVoice: true,
  seoStructure: true,
  imageSlugs: true,
  noOpenGaps: true
};

export default function App() {
  const [uiStage, setUiStage] = useState<UiStage>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready to capture a contractor recap.");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [timeline, setTimeline] = useState<SessionEvent[]>([]);
  const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus | null>(null);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<ApprovalChecklist>(defaultChecklist);
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const intervalRef = useRef<number | null>(null);

  const publishReady = useMemo(() => canPublish(checklist), [checklist]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleAuthError = params.get("googleAuthError");
    if (googleAuthError) {
      setUiStage("error");
      setStatusMessage(googleAuthError);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("googleAuthError");
      window.history.replaceState({}, "", nextUrl);
    }

    void getGoogleAuthStatus()
      .then((status) => {
        setGoogleAuthStatus(status);
        if (params.get("googleAuth") === "connected") {
          setUiStage("idle");
          setStatusMessage("Google account connected. You can continue with the recap flow.");
        }
      })
      .catch(() => setGoogleAuthStatus(null));
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    intervalRef.current = window.setInterval(async () => {
      try {
        const next = await getSession(sessionId);
        setResult(next);

        if (next.stage === "follow_up_required") {
          setUiStage("follow_up_required");
          setStatusMessage("Required recap fields are missing. Answer the follow-up prompts and retry.");
        } else if (next.stage === "partial") {
          setUiStage("partial");
          setStatusMessage("Extraction failed after retries. The draft is flagged as partial for review.");
        } else if (next.stage === "completed") {
          setUiStage("completed");
          setStatusMessage("Google Doc ready for editorial review.");
          const timelineResponse = await getTimeline(sessionId);
          setTimeline(timelineResponse.events);
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
          }
        } else if (next.stage === "error") {
          setUiStage("error");
          setStatusMessage(next.errorMessage ?? "The pipeline hit an error.");
          const timelineResponse = await getTimeline(sessionId);
          setTimeline(timelineResponse.events);
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
          }
        } else {
          setUiStage("processing");
        }
      } catch (error) {
        setUiStage("error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to poll session status.");
      }
    }, 400);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [sessionId]);

  async function ensureSessionId() {
    if (sessionId) {
      return sessionId;
    }

    const created = await createSession();
    setSessionId(created.sessionId);
    return created.sessionId;
  }

  async function submit(file: File, followUps?: Record<string, string>) {
    const nextSessionId = await ensureSessionId();

    if (!allowedMimeTypes.has(file.type)) {
      setUiStage("error");
      setStatusMessage("Unsupported upload type. Use webm, mp4, mp3, or wav audio.");
      return;
    }

    setUiStage(transitionUiStage(uiStage === "follow_up_required" || uiStage === "partial" || uiStage === "error" ? uiStage : "idle", "uploading"));
    setStatusMessage("Signing upload and sending recap audio.");

    const upload = await signUpload({
      sessionId: nextSessionId,
      fileName: file.name || "recap.webm",
      mimeType: file.type as "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav",
      sizeBytes: file.size,
      idempotencyKey: `upload-${nextSessionId}-${Date.now()}`
    });

    await uploadAudio(upload.uploadUrl, file);

    setUiStage(transitionUiStage("uploading", "processing"));
    setStatusMessage("Transcribing and drafting the Google Doc.");

    await startPipeline({
      sessionId: nextSessionId,
      uploadToken: upload.uploadToken,
      idempotencyKey: `pipeline-${nextSessionId}-${Date.now()}`,
      followUpAnswers: followUps
    });
  }

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Audio capture is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recordingMimeType = pickSupportedRecordingMimeType();
    const recorder = recordingMimeType ? new MediaRecorder(stream, { mimeType: recordingMimeType }) : new MediaRecorder(stream);

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const mimeType = recordingMimeType ?? (recorder.mimeType || "audio/webm");
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size < 2048) {
        setUiStage("error");
        setStatusMessage("Recording is too short. Please record for at least a few seconds before processing.");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        return;
      }

      const extension = extensionForMimeType(mimeType);
      const file = new File([blob], `recap-${Date.now()}.${extension}`, { type: mimeType });
      setSelectedFile(file);
      void submit(file).catch((error) => {
        setUiStage("error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to submit recap.");
      });

      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
    };

    recorder.start();
    recorderRef.current = recorder;
    streamRef.current = stream;
    setIsRecording(true);
    setUiStage(transitionUiStage("idle", "recording"));
    setStatusMessage("Recording the guided recap. Tap again when you are done.");
  }

  async function handlePrimaryButtonClick() {
    if (!isRecording) {
      try {
        await startRecording();
      } catch (error) {
        setUiStage("error");
        setStatusMessage(error instanceof Error ? error.message : "Unable to start recording.");
        setIsRecording(false);
      }
      return;
    }

    recorderRef.current?.stop();
  }

  async function handleRetry() {
    if (!selectedFile) {
      setUiStage("error");
      setStatusMessage("No recorded audio found for retry.");
      return;
    }

    await submit(selectedFile, followUpAnswers);
  }

  function handleConnectGoogle() {
    window.location.assign(getGoogleAuthStartUrl());
  }

  return (
    <main className="min-h-screen px-6 py-10 text-[#2a1c21]">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[2rem] border border-[#d9c1b1] bg-white/80 p-8 shadow-[0_24px_80px_rgba(98,59,34,0.14)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#9a6d53]">Contractor Capture</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold text-[#28181b] sm:text-5xl">
            One-button recap capture for a near publish-ready wedding blog draft.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#5b4043]">
            Record once, keep the schema strict, and hand the editor a Google Doc draft with local SEO structure already in place.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.5rem] bg-[#2d1f27] p-6 text-white">
              <div className="rounded-[1.5rem] border border-white/15 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.3em] text-[#f5d1ae]">Current stage</p>
                <p className="mt-3 text-3xl font-semibold capitalize">{uiStage.replaceAll("_", " ")}</p>
                <p className="mt-4 text-sm leading-6 text-[#f6e4d4]">{statusMessage}</p>
              </div>

              <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/5 p-4 text-sm text-[#f6e4d4]">
                <p className="text-xs uppercase tracking-[0.25em] text-[#f5d1ae]">Google auth</p>
                <p className="mt-2 font-medium text-white">
                  {googleAuthStatus?.configured === false
                    ? "OAuth is not configured yet."
                    : googleAuthStatus?.connected
                      ? `Connected as ${googleAuthStatus.email}`
                      : "Google is not connected."}
                </p>
                <button
                  className="mt-3 rounded-full border border-[#f0b489] px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#f5d1ae] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/40"
                  onClick={handleConnectGoogle}
                  disabled={googleAuthStatus?.configured === false}
                >
                  {googleAuthStatus?.connected ? "Reconnect Google" : "Connect Google"}
                </button>
              </div>

              <button
                className="mt-6 flex h-48 w-full items-center justify-center rounded-full border border-[#f0b489] bg-[radial-gradient(circle_at_30%_30%,#f9ccb2,#d9734e_58%,#6d2a1f)] text-center text-2xl font-semibold tracking-wide text-white shadow-[0_24px_40px_rgba(0,0,0,0.24)] transition hover:scale-[1.01]"
                onClick={() => {
                  void handlePrimaryButtonClick();
                }}
              >
                {isRecording ? "Stop And Process" : "Start Capture"}
              </button>

              <label className="mt-6 block text-sm text-[#f6e4d4]">
                Optional fallback upload
                <input
                  data-testid="audio-input"
                  type="file"
                  accept="audio/*"
                  className="mt-2 block w-full rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>

              <button
                className="mt-4 w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold"
                onClick={() => {
                  if (!selectedFile) {
                    setStatusMessage("Select an audio file first.");
                    return;
                  }
                  void submit(selectedFile).catch((error) => {
                    setUiStage("error");
                    setStatusMessage(error instanceof Error ? error.message : "Failed to submit fallback upload.");
                  });
                }}
              >
                Upload Selected Audio
              </button>
            </div>

            <div className="space-y-4">
              <p className="rounded-3xl border border-[#ead5ca] bg-[#fffaf4] px-5 py-4 text-sm leading-6 text-[#6a4c4f]">
                Final outcome log and retry reasons are shown in the right panel after completion or error.
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-[#dbcabc] bg-white/75 p-6 shadow-[0_24px_80px_rgba(98,59,34,0.10)]">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#9a6d53]">Editor Gate</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#28181b]">Approval checklist</h2>
            <div className="mt-5 space-y-3 text-sm text-[#5d4648]">
              {Object.entries(checklist).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 rounded-2xl border border-[#ecd8cd] bg-[#fff9f3] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) => {
                      setChecklist((current) => ({ ...current, [key]: event.target.checked }));
                    }}
                  />
                  <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                </label>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-[#7b5547]">
              {publishReady ? "Publish handoff unblocked." : "Publish handoff blocked until every requirement is checked."}
            </p>
          </section>

          <section className="rounded-[2rem] border border-[#dbcabc] bg-white/75 p-6 shadow-[0_24px_80px_rgba(98,59,34,0.10)]">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#9a6d53]">Pipeline Result</p>
            {result?.followUps.length ? (
              <div className="mt-4 space-y-4">
                <h3 className="text-xl font-semibold text-[#28181b]">Follow-up prompts</h3>
                {result.followUps.map((prompt) => (
                  <label key={prompt.field} className="block text-sm font-medium text-[#5d4648]">
                    {prompt.prompt}
                    <input
                      data-testid={`follow-up-${prompt.field}`}
                      className="mt-2 w-full rounded-2xl border border-[#e5cfc1] bg-[#fff9f3] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[#8b4d38] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff9f3]"
                      value={followUpAnswers[prompt.field] ?? ""}
                      onChange={(event) =>
                        setFollowUpAnswers((current) => ({
                          ...current,
                          [prompt.field]: event.target.value
                        }))
                      }
                    />
                  </label>
                ))}
                <button
                  className="rounded-full bg-[#8b4d38] px-5 py-3 text-sm font-semibold text-white"
                  onClick={() => {
                    void handleRetry();
                  }}
                >
                  Retry With Follow-ups
                </button>
              </div>
            ) : null}

            {result?.blogOutput ? (
              <div className="mt-4 space-y-4">
                <h3 className="text-xl font-semibold text-[#28181b]">Draft output</h3>
                <p className="text-lg font-semibold text-[#3d2226]">{result.blogOutput.primary_title}</p>
                <p className="text-sm leading-6 text-[#5d4648]">{result.blogOutput.meta_description}</p>
              </div>
            ) : null}

            {result?.googleDoc ? (
              <div className="mt-4 rounded-3xl border border-[#e6d6c6] bg-[#fff8ef] px-5 py-4 text-sm text-[#5d4648]">
                <p className="font-semibold">Google Doc Ready</p>
                <a className="mt-2 inline-block text-[#8b4d38] underline" href={result.googleDoc.url} target="_blank" rel="noreferrer">
                  Open generated draft
                </a>
              </div>
            ) : null}

            {timeline.length > 0 ? (
              <div className="mt-4 rounded-3xl border border-[#e6d6c6] bg-[#fff8ef] px-5 py-4 text-sm text-[#5d4648]">
                <p className="font-semibold">Final outcome log</p>
                <ul className="mt-2 space-y-1">
                  {timeline.map((event) => (
                    <li key={event.id}>
                      {new Date(event.createdAt).toLocaleTimeString()} {event.stageFrom} {"->"} {event.stageTo}
                      {event.reason ? ` (${event.reason})` : ""}
                    </li>
                  ))}
                </ul>
                {result?.retryMetadata.lastFailureReason ? (
                  <p className="mt-2 text-[#8b4d38]">Last failure reason: {result.retryMetadata.lastFailureReason}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
