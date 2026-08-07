import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { SessionResult } from "@wedding/contracts";

import { createSession, getSession, signUpload, startPipeline } from "./api";
import { canPublish, transitionUiStage, type ApprovalChecklist, type UiStage } from "./sessionMachine";

const defaultTranscript = [
  "couple: Alex and Sam.",
  "venue: Cypress Grove Estate House.",
  "city: Orlando, Florida.",
  "style: romantic garden.",
  "timeline: sunset ceremony, candlelit dinner, packed dance floor.",
  "moments: private vows, confetti exit.",
  "portraits: soft lakeside portraits.",
  "weather: warm and clear.",
  "reception: crowded dance floor, heartfelt toasts."
].join(" ");

const allowedMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]);

const defaultChecklist: ApprovalChecklist = {
  factualAccuracy: true,
  brandVoice: true,
  seoStructure: true,
  imageSlugs: true,
  noOpenGaps: true
};

const followUpLabelMap: Record<string, string> = {
  couple_names: "couple",
  venue_name: "venue",
  venue_city_state: "city"
};

type Scenario = "normal" | "missing_fields" | "invalid_twice" | "queued";

export default function App() {
  const [uiStage, setUiStage] = useState<UiStage>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready to capture a contractor recap.");
  const [transcriptText, setTranscriptText] = useState(defaultTranscript);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<ApprovalChecklist>(defaultChecklist);
  const intervalRef = useRef<number | null>(null);

  const deferredTranscript = useDeferredValue(transcriptText);
  const publishReady = useMemo(() => canPublish(checklist), [checklist]);

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
          setStatusMessage("The structured extraction failed twice. The draft is flagged as partial for review.");
        } else if (next.stage === "completed") {
          setUiStage("completed");
          setStatusMessage(next.googleDoc?.status === "queued" ? "Draft queued for async Google Doc completion." : "Google Doc ready for editorial review.");
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
          }
        } else if (next.stage === "error") {
          setUiStage("error");
          setStatusMessage(next.errorMessage ?? "The pipeline hit an error.");
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
    }, 300);

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

  async function submit(transcript: string, nextScenario: Scenario = scenario) {
    const nextSessionId = await ensureSessionId();
    const fileMetadata = selectedFile
      ? {
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size
        }
      : {
          fileName: "recap.webm",
          mimeType: "audio/webm",
          sizeBytes: 2048
        };

    if (!allowedMimeTypes.has(fileMetadata.mimeType)) {
      setUiStage("error");
      setStatusMessage("Unsupported upload type. Use webm, mp4, mp3, or wav audio.");
      return;
    }

    setUiStage(transitionUiStage(uiStage === "follow_up_required" || uiStage === "partial" || uiStage === "error" ? uiStage : "idle", "uploading"));
    setStatusMessage("Signing upload and submitting the recap.");

    const upload = await signUpload({
      sessionId: nextSessionId,
      fileName: fileMetadata.fileName,
      mimeType: fileMetadata.mimeType as "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav",
      sizeBytes: fileMetadata.sizeBytes,
      idempotencyKey: `upload-${nextSessionId}-${Date.now()}`
    });

    setUiStage(transitionUiStage("uploading", "processing"));
    setStatusMessage("Transcribing and drafting the Google Doc.");

    await startPipeline({
      sessionId: nextSessionId,
      uploadToken: upload.uploadToken,
      idempotencyKey: `pipeline-${nextSessionId}-${Date.now()}`,
      transcriptText: transcript,
      simulate: {
        extractionMode: nextScenario === "missing_fields" ? "missing_fields" : nextScenario === "invalid_twice" ? "invalid_twice" : "normal",
        publishMode: nextScenario === "queued" ? "queued" : "normal"
      }
    });
  }

  async function handlePrimaryButtonClick() {
    if (uiStage === "idle") {
      setUiStage(transitionUiStage("idle", "recording"));
      setStatusMessage("Recording the guided recap. Tap again when you are done.");
      return;
    }

    if (uiStage === "recording") {
      startTransition(() => {
        void submit(transcriptText).catch((error) => {
          setUiStage("error");
          setStatusMessage(error instanceof Error ? error.message : "Failed to submit recap.");
        });
      });
    }
  }

  async function handleRetry() {
    const patchedTranscript = `${transcriptText} ${Object.entries(followUpAnswers)
      .map(([field, answer]) => `${followUpLabelMap[field] ?? field}: ${answer}.`)
      .join(" ")}`;
    setTranscriptText(patchedTranscript);
    await submit(patchedTranscript, scenario === "missing_fields" ? "normal" : scenario);
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

              <button
                className="mt-6 flex h-48 w-full items-center justify-center rounded-full border border-[#f0b489] bg-[radial-gradient(circle_at_30%_30%,#f9ccb2,#d9734e_58%,#6d2a1f)] text-center text-2xl font-semibold tracking-wide text-white shadow-[0_24px_40px_rgba(0,0,0,0.24)] transition hover:scale-[1.01]"
                onClick={() => {
                  void handlePrimaryButtonClick();
                }}
              >
                {uiStage === "recording" ? "Stop And Process" : "Start Capture"}
              </button>

              <label className="mt-6 block text-sm text-[#f6e4d4]">
                Scenario
                <select
                  data-testid="scenario-select"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none"
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value as Scenario)}
                >
                  <option value="normal" className="text-black">Normal</option>
                  <option value="missing_fields" className="text-black">Missing fields</option>
                  <option value="invalid_twice" className="text-black">Schema invalid twice</option>
                  <option value="queued" className="text-black">Queued Google Doc</option>
                </select>
              </label>

              <label className="mt-6 block text-sm text-[#f6e4d4]">
                Optional fallback upload
                <input
                  data-testid="audio-input"
                  type="file"
                  accept="audio/*,.txt"
                  className="mt-2 block w-full rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-semibold uppercase tracking-[0.3em] text-[#8f6656]">
                Transcript seed
                <textarea
                  data-testid="transcript-input"
                  className="mt-3 min-h-72 w-full rounded-[1.5rem] border border-[#dfc9bc] bg-[#fffaf5] px-5 py-4 text-base leading-7 outline-none"
                  value={transcriptText}
                  onChange={(event) => setTranscriptText(event.target.value)}
                />
              </label>
              <p className="rounded-3xl border border-[#ead5ca] bg-[#fffaf4] px-5 py-4 text-sm leading-6 text-[#6a4c4f]">
                Deferred preview: {deferredTranscript.slice(0, 220)}{deferredTranscript.length > 220 ? "..." : ""}
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
                      className="mt-2 w-full rounded-2xl border border-[#e5cfc1] bg-[#fff9f3] px-4 py-3 outline-none"
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
                <ul className="space-y-2 text-sm leading-6 text-[#5d4648]">
                  {result.blogOutput.section_blocks.map((section) => (
                    <li key={section.heading} className="rounded-2xl border border-[#ebd8cb] bg-[#fff9f3] px-4 py-3">
                      <strong>{section.heading}:</strong> {section.body}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result?.googleDoc ? (
              <div className="mt-4 rounded-3xl border border-[#e6d6c6] bg-[#fff8ef] px-5 py-4 text-sm text-[#5d4648]">
                <p className="font-semibold">Google Doc {result.googleDoc.status === "queued" ? "Queued" : "Ready"}</p>
                <a className="mt-2 inline-block text-[#8b4d38] underline" href={result.googleDoc.url} target="_blank" rel="noreferrer">
                  Open generated draft
                </a>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}