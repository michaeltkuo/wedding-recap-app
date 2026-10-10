import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  Check,
  CircleAlert,
  CircleHelp,
  FileAudio,
  FileText,
  Library,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Send,
  Settings2,
  Upload,
  Volume2,
  X
} from "lucide-react";

import type { Recap, SessionResult } from "@wedding/contracts";

import { createSession, getSession, publishSession, signUpload, startPipeline, uploadAudio } from "./api";
import { transitionUiStage, type UiStage } from "./sessionMachine";
import { useAudioRecorder } from "./useAudioRecorder";

type EventDetails = {
  dateLabel: string;
  coupleNames: string;
  venueName: string;
  cityState: string;
};

type LibraryStatus = "shaping" | "ready" | "sent" | "retry";

type LibraryEntry = {
  sessionId: string;
  title: string;
  subtitle: string;
  createdAt: string;
  status: LibraryStatus;
  googleDocUrl?: string;
};

type View = "capture" | "library";

const historyStorageKey = "recap-studio-history";

const defaultEvent: EventDetails = {
  dateLabel: "",
  coupleNames: "",
  venueName: "",
  cityState: ""
};

const allowedMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]);

const storyCues = [
  "Where did the day begin, and what did the setting feel like?",
  "Which moment best captured the couple together?",
  "What made the ceremony feel like them?",
  "What shifted when the reception opened up?"
];

const followUpTranscriptLabels: Record<string, string> = {
  couple_names: "couple",
  venue_name: "venue",
  venue_city_state: "city",
  weather_notes: "weather"
};

const waveHeights = [24, 44, 66, 34, 78, 108, 58, 128, 84, 42, 92, 146, 72, 54, 120, 76, 38, 108, 66, 88, 48, 74, 34, 58, 28];

function normalizeAudioMimeType(audio: Blob, fileName?: string) {
  const fromBlob = audio.type.split(";", 1)[0]?.trim().toLowerCase();
  if (fromBlob && allowedMimeTypes.has(fromBlob)) {
    return fromBlob;
  }

  const extension = fileName?.split(".").pop()?.toLowerCase();
  const fromExtension: Record<string, string> = {
    webm: "audio/webm",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav"
  };
  const inferredMimeType = extension ? fromExtension[extension] : undefined;
  return inferredMimeType && allowedMimeTypes.has(inferredMimeType) ? inferredMimeType : undefined;
}

function extensionForMimeType(mimeType: string) {
  return (
    {
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav"
    }[mimeType] ?? "webm"
  );
}

function formatDuration(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getHistory() {
  if (typeof window === "undefined") {
    return [] as LibraryEntry[];
  }

  try {
    const stored = window.localStorage.getItem(historyStorageKey);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as LibraryEntry[]) : [];
  } catch {
    return [] as LibraryEntry[];
  }
}

function persistHistory(history: LibraryEntry[]) {
  try {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
  } catch {
    return;
  }
}

function historyEntry(sessionId: string, eventDetails: EventDetails, status: LibraryStatus, recap?: Recap, googleDocUrl?: string): LibraryEntry {
  const title = recap?.couple_names || eventDetails.coupleNames || "Untitled recap";
  const venue = recap?.venue_name || eventDetails.venueName || "Wedding recap";
  const city = recap?.venue_city_state || eventDetails.cityState;
  return {
    sessionId,
    title,
    subtitle: city ? `${venue} / ${city}` : venue,
    createdAt: new Date().toISOString(),
    status,
    googleDocUrl
  };
}

function Waveform({ level, compact = false }: { level: number; compact?: boolean }) {
  const size = compact ? 17 : 31;
  return (
    <div className={`waveform ${compact ? "waveform-compact" : ""}`} aria-hidden="true">
      {Array.from({ length: size }, (_, index) => {
        const baseHeight = waveHeights[index % waveHeights.length];
        const variation = 0.36 + level * 0.64 * (index % 3 === 0 ? 1 : 0.8);
        return <span key={index} style={{ height: `${Math.max(5, Math.round(baseHeight * variation))}px` }} />;
      })}
    </div>
  );
}

type CoverageField = "venue_name" | "timeline_summary" | "portrait_notes" | "reception_highlights" | "weather_notes";

function getCoverageRows(recap?: Recap) {
  return [
    {
      key: "venue_name" as const,
      label: "Setting",
      value: recap?.venue_name && recap.venue_city_state ? `${recap.venue_name}, ${recap.venue_city_state}` : "Not found in this recap",
      complete: Boolean(recap?.venue_name && recap.venue_city_state)
    },
    {
      key: "timeline_summary" as const,
      label: "Ceremony",
      value: recap?.timeline_summary ?? "Not found in this recap",
      complete: Boolean(recap?.timeline_summary)
    },
    {
      key: "portrait_notes" as const,
      label: "Portraits",
      value: recap?.portrait_notes ?? "Not found in this recap",
      complete: Boolean(recap?.portrait_notes)
    },
    {
      key: "reception_highlights" as const,
      label: "Reception",
      value: recap?.reception_highlights?.join(", ") ?? "Not found in this recap",
      complete: Boolean(recap?.reception_highlights?.length)
    },
    {
      key: "weather_notes" as const,
      label: "Weather",
      value: recap?.weather_notes ?? "Not found in this recap",
      complete: Boolean(recap?.weather_notes)
    }
  ];
}

export function CoverageMap({
  recap,
  activeField,
  gapDraft,
  onGapDraftChange,
  onOpenRow,
  onSaveDetail,
  onCancelDetail
}: {
  recap?: Recap;
  activeField: CoverageField | null;
  gapDraft: string;
  onGapDraftChange: (value: string) => void;
  onOpenRow: (field: CoverageField) => void;
  onSaveDetail: (field: CoverageField, value: string) => void;
  onCancelDetail: () => void;
}) {
  const coverage = getCoverageRows(recap);

  return (
    <div className="coverage-map">
      {coverage.map((item) => {
        const isOpen = !item.complete;
        const isActive = activeField === item.key;

        return (
          <div className="coverage-group" key={item.label}>
            <button
              type="button"
              className={`coverage-row ${isOpen ? "is-open" : "is-complete"}`}
              onClick={isOpen ? () => onOpenRow(item.key) : undefined}
              aria-expanded={isActive}
              aria-label={item.label}
              disabled={Boolean(item.complete)}
            >
              <span className={`coverage-icon ${item.complete ? "is-complete" : "is-open"}`} aria-hidden="true">
                {item.complete ? <Check size={14} /> : <CircleAlert size={14} />}
              </span>
              <strong>{item.label}</strong>
              <p>{item.value}</p>
              <span className={`coverage-status ${item.complete ? "is-complete" : "is-open"}`}>{item.complete ? "Captured" : isActive ? "Open" : "Open"}</span>
            </button>
            {isActive && isOpen ? (
              <div className="coverage-gap-editor" aria-live="polite">
                <input
                  value={gapDraft}
                  onChange={(event) => onGapDraftChange(event.target.value)}
                  placeholder={item.label === "Weather" ? "Weather detail" : `Add ${item.label.toLowerCase()} detail`}
                  aria-label={`Add ${item.label.toLowerCase()} detail`}
                />
                <button className="secondary-button small-button" type="button" onClick={onCancelDetail}>Cancel</button>
                <button className="primary-button small-button" type="button" onClick={() => onSaveDetail(item.key, gapDraft)}>
                  Save detail
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TranscriptDrawer({ isOpen, onClose, text }: { isOpen: boolean; onClose: () => void; text: string }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="transcript-drawer" role="dialog" aria-modal="true" aria-label="Transcript preview">
      <div className="transcript-header">
        <h2>Transcript preview</h2>
        <button className="icon-button light-icon-button" type="button" onClick={onClose} aria-label="Close transcript"><X size={16} /></button>
      </div>
      <p className="transcript-helper">Transcript helps verify details before delivery.</p>
      {text.trim() ? (
        <div className="transcript-copy" aria-live="polite">{text.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>)}</div>
      ) : (
        <div className="transcript-empty">Transcript is not available yet for this session. You can still resolve open details and send recap.</div>
      )}
    </div>
  );
}

function AppNavigation({
  view,
  onCapture,
  onLibrary,
  onHelp
}: {
  view: View;
  onCapture: () => void;
  onLibrary: () => void;
  onHelp: () => void;
}) {
  return (
    <>
      <aside className="desktop-rail">
        <div className="wordmark"><span>R</span>REC / STUDIO</div>
        <nav aria-label="Application">
          <button className={view === "capture" ? "is-active" : ""} type="button" onClick={onCapture}>
            <Mic size={17} />
            Capture
          </button>
          <button className={view === "library" ? "is-active" : ""} type="button" onClick={onLibrary}>
            <Library size={17} />
            Library
          </button>
          <button type="button" onClick={onHelp}>
            <CircleHelp size={17} />
            Help
          </button>
        </nav>
        <div className="delivery-desk">
          <p>Delivery desk</p>
          <strong>michael@authormadephoto.com</strong>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Application">
        <button className={view === "capture" ? "is-active" : ""} type="button" onClick={onCapture}>
          <Mic size={18} />
          <span>Capture</span>
        </button>
        <button className={view === "library" ? "is-active" : ""} type="button" onClick={onLibrary}>
          <Library size={18} />
          <span>Library</span>
        </button>
        <button type="button" onClick={onHelp}>
          <CircleHelp size={18} />
          <span>Help</span>
        </button>
      </nav>
    </>
  );
}

export default function App() {
  const [uiStage, setUiStage] = useState<UiStage>("ready");
  const [view, setView] = useState<View>("capture");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [eventDetails, setEventDetails] = useState<EventDetails>(defaultEvent);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [activeCoverageField, setActiveCoverageField] = useState<CoverageField | null>(null);
  const [gapDraft, setGapDraft] = useState("");
  const [capturedAudio, setCapturedAudio] = useState<Blob | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready to capture your field note.");
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [cueIndex, setCueIndex] = useState(0);
  const [markedMoments, setMarkedMoments] = useState(0);
  const [history, setHistory] = useState<LibraryEntry[]>(getHistory);
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();

  function transitionTo(nextStage: UiStage) {
    setUiStage((currentStage) => (currentStage === nextStage ? currentStage : transitionUiStage(currentStage, nextStage)));
  }

  function upsertHistory(nextEntry: LibraryEntry) {
    setHistory((currentHistory) => {
      const nextHistory = [nextEntry, ...currentHistory.filter((entry) => entry.sessionId !== nextEntry.sessionId)].slice(0, 30);
      persistHistory(nextHistory);
      return nextHistory;
    });
  }

  function updateSessionHistory(status: LibraryStatus, nextResult?: SessionResult) {
    if (!sessionId) {
      return;
    }
    upsertHistory(historyEntry(sessionId, eventDetails, status, nextResult?.recap, nextResult?.googleDoc?.url));
  }

  useEffect(() => {
    if (!sessionId || (uiStage !== "processing" && uiStage !== "sending")) {
      return;
    }

    let disposed = false;
    const pollSession = async () => {
      try {
        const nextResult = await getSession(sessionId);
        if (disposed) {
          return;
        }
        setResult(nextResult);

        if (nextResult.stage === "review_ready") {
          transitionTo("review");
          setStatusMessage("Your recap is ready to shape.");
          updateSessionHistory("ready", nextResult);
        } else if (nextResult.stage === "follow_up_required") {
          transitionTo("follow_up");
          setStatusMessage("A few details need your attention before we can send this recap.");
          updateSessionHistory("retry", nextResult);
        } else if (nextResult.stage === "completed") {
          transitionTo("delivered");
          setStatusMessage("Your recap has been delivered to Michael's editorial desk.");
          updateSessionHistory("sent", nextResult);
        } else if (nextResult.stage === "partial" || nextResult.stage === "error") {
          transitionTo("error");
          setStatusMessage(nextResult.errorMessage ?? "We could not finish this recap.");
          updateSessionHistory("retry", nextResult);
        }
      } catch (pollingError) {
        if (!disposed) {
          transitionTo("error");
          setStatusMessage(pollingError instanceof Error ? pollingError.message : "We could not check this recap.");
        }
      }
    };

    void pollSession();
    const pollingInterval = window.setInterval(() => {
      void pollSession();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(pollingInterval);
    };
  }, [sessionId, uiStage]);

  async function processAudio(audio: Blob, transcriptText?: string, existingSessionId?: string) {
    const mimeType = normalizeAudioMimeType(audio, audio instanceof File ? audio.name : undefined);
    if (!mimeType) {
      transitionTo("error");
      setStatusMessage("Use a webm, m4a, mp3, or wav audio file.");
      return;
    }

    const uploadAudioBlob = audio.type.split(";", 1)[0]?.toLowerCase() === mimeType ? audio : new Blob([audio], { type: mimeType });
    if (uploadAudioBlob.size === 0) {
      transitionTo("error");
      setStatusMessage("The audio file is empty. Record again or choose another file.");
      return;
    }

    try {
      transitionTo("uploading");
      setStatusMessage("Saving your tape securely.");

      const targetSessionId = existingSessionId ?? (await createSession()).sessionId;
      setSessionId(targetSessionId);
      upsertHistory(historyEntry(targetSessionId, eventDetails, "shaping"));

      const upload = await signUpload({
        sessionId: targetSessionId,
        fileName: audio instanceof File ? audio.name : `recap-${Date.now()}.${extensionForMimeType(mimeType)}`,
        mimeType: mimeType as "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav",
        sizeBytes: uploadAudioBlob.size,
        idempotencyKey: `upload-${targetSessionId}-${Date.now()}`
      });
      await uploadAudio(upload.uploadUrl, uploadAudioBlob);

      transitionTo("processing");
      setStatusMessage("Listening for the important parts of the day.");
      const payload = {
        sessionId: targetSessionId,
        uploadToken: upload.uploadToken,
        idempotencyKey: `process-${targetSessionId}-${Date.now()}`,
        ...(transcriptText?.trim() ? { transcriptText } : {})
      };
      await startPipeline(payload);
    } catch (processingError) {
      transitionTo("error");
      setStatusMessage(processingError instanceof Error ? processingError.message : "The recap could not be uploaded.");
      updateSessionHistory("retry");
    }
  }

  async function startRecording() {
    const started = await recorder.start();
    if (started) {
      transitionTo("recording");
      setStatusMessage("Recording. Tell the day in the order you remember it.");
      return;
    }

    transitionTo("error");
    setStatusMessage(recorder.error ?? "Microphone access could not be started. Import an audio file instead.");
  }

  async function stopRecording() {
    const audio = await recorder.stop();
    if (!audio) {
      transitionTo("error");
      setStatusMessage("No audio was captured. Record again or import an audio file.");
      return;
    }

    setCapturedAudio(audio);
    await processAudio(audio);
  }

  function handleAudioImport(event: ChangeEvent<HTMLInputElement>) {
    const audio = event.target.files?.[0];
    event.target.value = "";
    if (!audio) {
      return;
    }
    setCapturedAudio(audio);
    void processAudio(audio);
  }

  async function sendRecap() {
    if (!sessionId) {
      transitionTo("error");
      setStatusMessage("This recap no longer has an active session. Start a new recording.");
      return;
    }

    try {
      transitionTo("sending");
      setStatusMessage("Building the editorial handoff.");
      await publishSession(sessionId);
      const delivered = await getSession(sessionId);
      setResult(delivered);
      transitionTo("delivered");
      setStatusMessage("Your recap has been delivered to Michael's editorial desk.");
      updateSessionHistory("sent", delivered);
    } catch (deliveryError) {
      transitionTo("error");
      setStatusMessage(deliveryError instanceof Error ? deliveryError.message : "This recap could not be sent.");
      updateSessionHistory("retry");
    }
  }

  async function submitFollowUps() {
    const prompts = result?.followUps ?? [];
    const unanswered = prompts.find((prompt) => !followUpAnswers[prompt.field]?.trim());
    if (unanswered) {
      setFollowUpError("Add a quick answer for each required detail.");
      return;
    }
    if (!capturedAudio) {
      transitionTo("error");
      setStatusMessage("The original audio is no longer available in this browser. Start a new recap.");
      return;
    }

    setFollowUpError(null);
    const answers = prompts
      .map((prompt) => `${followUpTranscriptLabels[prompt.field] ?? prompt.field}: ${followUpAnswers[prompt.field]}.`)
      .join(" ");
    await processAudio(capturedAudio, answers, sessionId ?? undefined);
  }

  function startNewRecap() {
    setView("capture");
    setSessionId(null);
    setResult(null);
    setCapturedAudio(null);
    setFollowUpAnswers({});
    setFollowUpError(null);
    setCueIndex(0);
    setMarkedMoments(0);
    setStatusMessage("Ready to capture your field note.");
    if (uiStage !== "ready") {
      transitionTo("ready");
    }
  }

  function markMoment() {
    setMarkedMoments((currentCount) => currentCount + 1);
    setStatusMessage(`Moment ${markedMoments + 1} marked at ${formatDuration(recorder.elapsedMs)}.`);
  }

  const audioLevelLabel = recorder.level > 0.55 ? "Strong" : recorder.level > 0.2 ? "Good" : "Listening";
  const activeCue = storyCues[cueIndex % storyCues.length];
  const recap = result?.recap;
  const transcriptText = result?.transcript?.entries?.map((entry) => entry.utterance_text).join("\n\n") ?? "";
  const historyForDisplay = history.slice(0, 12);

  function openCoverageRow(field: CoverageField) {
    const currentValue = recap?.[field];
    const draftValue = field === "reception_highlights"
      ? Array.isArray(currentValue) ? currentValue.join(", ") : ""
      : typeof currentValue === "string" ? currentValue : "";
    setActiveCoverageField(field);
    setGapDraft(draftValue);
  }

  function closeCoverageEditor() {
    setActiveCoverageField(null);
    setGapDraft("");
  }

  function saveCoverageDetail(field: CoverageField, value: string) {
    const nextValue = value.trim();
    if (!nextValue) {
      return;
    }

    setResult((currentResult) => {
      if (!currentResult) {
        return currentResult;
      }

      const existingRecap = currentResult.recap ?? {
        couple_names: eventDetails.coupleNames || "",
        venue_name: eventDetails.venueName || "",
        venue_city_state: eventDetails.cityState || "",
        wedding_style: "",
        timeline_summary: "",
        signature_moments: [],
        portrait_notes: "",
        weather_notes: "",
        vendor_notes: [],
        cultural_traditions: [],
        reception_highlights: []
      };

      const nextRecap = {
        ...existingRecap,
        ...(field === "reception_highlights" ? { reception_highlights: [nextValue] } : { [field]: nextValue })
      } as Recap;

      return {
        ...currentResult,
        recap: nextRecap
      };
    });

    closeCoverageEditor();
  }

  function renderCaptureContent() {
    if (uiStage === "recording") {
      return (
        <section className="recording-workspace" aria-labelledby="recording-heading">
          <header className="workspace-topbar">
            <div className="session-location"><span className="recording-dot" />{eventDetails.coupleNames || "New recap"} / {eventDetails.venueName || "Field note"}</div>
            <button className="icon-button" type="button" onClick={recorder.status === "paused" ? recorder.resume : recorder.pause} aria-label={recorder.status === "paused" ? "Resume recording" : "Pause recording"}>
              {recorder.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </header>
          <div className="recording-layout">
            <div className="recorder-stage">
              <div className="recorder-status"><p id="recording-heading"><span className="recording-dot" />{recorder.status === "paused" ? "Paused" : "Recording"}</p><time>{formatDuration(recorder.elapsedMs)}</time></div>
              <div className="recording-wave"><Waveform level={recorder.level} /></div>
              <p className="audio-level"><Volume2 size={16} />Input level: {audioLevelLabel}</p>
              <div className="recorder-controls">
                <button className="text-icon-button" type="button" onClick={markMoment}><BookmarkPlus size={17} />Mark moment{markedMoments ? ` (${markedMoments})` : ""}</button>
                <button className="stop-recording-button" type="button" onClick={() => void stopRecording()} aria-label="Stop recording"><span /></button>
                <button className="text-icon-button" type="button" onClick={recorder.status === "paused" ? recorder.resume : recorder.pause}>{recorder.status === "paused" ? <Play size={17} /> : <Pause size={17} />}{recorder.status === "paused" ? "Resume" : "Pause"}</button>
              </div>
            </div>
            <aside className="story-cue-panel" aria-label="Story cue">
              <p className="eyebrow">Story cue / {String((cueIndex % storyCues.length) + 1).padStart(2, "0")}</p>
              <h2>{activeCue}</h2>
              <p>You can answer now, skip it, or return to it after the tape stops.</p>
              <div className="cue-actions"><button type="button" onClick={() => setCueIndex((index) => index + 1)}>Skip cue</button><button type="button" onClick={markMoment}>Mark moment</button></div>
              <ol className="cue-list">
                {storyCues.map((cue, index) => <li className={index < cueIndex ? "is-done" : index === cueIndex ? "is-current" : ""} key={cue}><span>{String(index + 1).padStart(2, "0")} / {index === 0 ? "Arrival" : index === 1 ? "Portraits" : index === 2 ? "Ceremony" : "Reception"}</span><span>{index < cueIndex ? "Noted" : index === cueIndex ? "Open" : "Next"}</span></li>)}
              </ol>
            </aside>
          </div>
        </section>
      );
    }

    if (uiStage === "uploading" || uiStage === "processing" || uiStage === "sending") {
      const sending = uiStage === "sending";
      return (
        <section className="processing-workspace" aria-labelledby="processing-heading">
          <div className="processing-content">
            <LoaderCircle className="processing-icon" size={38} aria-hidden="true" />
            <p className="eyebrow">{sending ? "Preparing delivery" : uiStage === "uploading" ? "Saving your tape" : "Shaping your recap"}</p>
            <h1 id="processing-heading">{sending ? "Building the editorial handoff." : "Listening for the story."}</h1>
            <p>{statusMessage}</p>
            <ol className="delivery-progress" aria-label="Recap progress">
              <li className={uiStage === "uploading" ? "is-active" : "is-done"}><span>Audio saved</span><small>{uiStage === "uploading" ? "Working" : "Done"}</small></li>
              <li className={uiStage === "processing" ? "is-active" : sending ? "is-done" : ""}><span>Story shaped</span><small>{uiStage === "processing" ? "Working" : sending ? "Done" : "Waiting"}</small></li>
              <li className={sending ? "is-active" : ""}><span>Handoff sent</span><small>{sending ? "Working" : "Waiting"}</small></li>
            </ol>
          </div>
        </section>
      );
    }

    if (uiStage === "review") {
      return (
        <section className="light-workspace review-workspace" aria-labelledby="review-heading">
          <header className="workspace-topbar light-topbar"><div className="session-location">{recap?.couple_names || eventDetails.coupleNames || "New field note"} / Review</div><button className="icon-button light-icon-button" type="button" aria-label="Transcript preview" onClick={() => setTranscriptOpen(true)}><FileText size={18} /></button></header>
          <div className="review-content">
            <div className="review-heading"><div><p className="eyebrow">Coverage map</p><h1 id="review-heading">The story is taking shape.</h1><p>Review the coverage, then send it to Michael. Open rows are actionable and can be resolved inline.</p></div><strong>{recap ? "5 / 5 FOUND" : "IN REVIEW"}</strong></div>
            <CoverageMap
              recap={recap}
              activeField={activeCoverageField}
              gapDraft={gapDraft}
              onGapDraftChange={setGapDraft}
              onOpenRow={openCoverageRow}
              onSaveDetail={saveCoverageDetail}
              onCancelDetail={closeCoverageEditor}
            />
            <div className="review-note"><div><h2>Ready when you are.</h2><p>You can send this recap now, or read the transcript before delivery.</p></div><button className="secondary-button" type="button" onClick={() => setTranscriptOpen(true)}><FileText size={16} />Read transcript</button></div>
            <div className="review-actions"><button className="secondary-button" type="button" onClick={startNewRecap}>Discard and start again</button><button className="primary-button" type="button" onClick={() => void sendRecap()}><Send size={16} />Send recap</button></div>
            <TranscriptDrawer isOpen={transcriptOpen} onClose={() => setTranscriptOpen(false)} text={transcriptText} />
          </div>
        </section>
      );
    }

    if (uiStage === "follow_up") {
      return (
        <section className="light-workspace review-workspace" aria-labelledby="follow-up-heading">
          <header className="workspace-topbar light-topbar"><div className="session-location">{eventDetails.coupleNames || "New recap"} / Add details</div><button className="icon-button light-icon-button" type="button" onClick={startNewRecap} aria-label="Start a new recap"><X size={18} /></button></header>
          <div className="review-content">
            <div className="review-heading"><div><p className="eyebrow">A few details need a note</p><h1 id="follow-up-heading">Keep the story moving.</h1><p>These details make the handoff usable for the editorial team. Your original tape stays attached.</p></div><strong>{result?.followUps.length ?? 0} OPEN</strong></div>
            <div className="follow-up-fields">
              {result?.followUps.map((prompt) => <label key={prompt.field}><span>{prompt.prompt}</span><input value={followUpAnswers[prompt.field] ?? ""} onChange={(event) => setFollowUpAnswers((current) => ({ ...current, [prompt.field]: event.target.value }))} /></label>)}
            </div>
            {followUpError ? <p className="form-error" role="alert"><CircleAlert size={16} />{followUpError}</p> : null}
            <div className="review-actions"><button className="secondary-button" type="button" onClick={startNewRecap}>Start a new recap</button><button className="primary-button" type="button" onClick={() => void submitFollowUps()}><Upload size={16} />Update recap</button></div>
          </div>
        </section>
      );
    }

    if (uiStage === "delivered") {
      return (
        <section className="light-workspace delivery-workspace" aria-labelledby="delivery-heading">
          <header className="workspace-topbar light-topbar"><div className="session-location">{recap?.couple_names || eventDetails.coupleNames} / Delivery</div><button className="icon-button light-icon-button" type="button" onClick={() => setView("library")} aria-label="Open recap library"><Library size={18} /></button></header>
          <div className="delivery-content">
            <span className="delivery-check"><Check size={30} /></span>
            <p className="eyebrow">Dispatch complete</p>
            <h1 id="delivery-heading">Your recap is on its way.</h1>
            <p>The original tape, structured notes, and a working blog draft are bundled for editorial review.</p>
            <ol className="delivery-progress is-complete"><li className="is-done"><span>Tape saved</span><small>Complete</small></li><li className="is-done"><span>Story shaped</span><small>Complete</small></li><li className="is-done"><span>Draft built</span><small>Complete</small></li><li className="is-done"><span>Handoff sent</span><small>Live</small></li></ol>
            <p className="destination"><Send size={17} />Delivered to <strong>michael@authormadephoto.com</strong></p>
            <div className="delivery-actions"><button className="secondary-button" type="button" onClick={startNewRecap}><Mic size={16} />New recap</button>{result?.googleDoc ? <a className="primary-button" href={result.googleDoc.url} target="_blank" rel="noreferrer"><FileText size={16} />Open working draft</a> : null}</div>
          </div>
        </section>
      );
    }

    if (uiStage === "error") {
      return (
        <section className="error-workspace" aria-labelledby="error-heading">
          <div className="error-content"><CircleAlert size={38} /><p className="eyebrow">Capture needs attention</p><h1 id="error-heading">This recap did not finish.</h1><p>{statusMessage}</p><div className="error-actions">{capturedAudio ? <button className="primary-button" type="button" onClick={() => void processAudio(capturedAudio, undefined, sessionId ?? undefined)}><Upload size={16} />Try again</button> : null}<button className="secondary-button inverse-secondary" type="button" onClick={startNewRecap}>Start a new recap</button></div></div>
          <div className="error-content"><CircleAlert size={38} /><p className="eyebrow">Capture needs attention</p><h1 id="error-heading">This recap did not finish.</h1><p>{statusMessage}</p><div className="error-actions">{capturedAudio ? <button className="primary-button" type="button" onClick={() => void processAudio(capturedAudio, undefined, sessionId ?? undefined)}><Upload size={16} />Try again</button> : null}<button className="secondary-button inverse-secondary" type="button" onClick={startNewRecap}>Start a new recap</button></div></div>
        </section>
      );
    }

    return (
      <section className="ready-workspace" aria-labelledby="ready-heading">
        <header className="workspace-topbar">
          <div className="session-location"><span className="recording-dot" />New field note</div>
          <button className="icon-button" type="button" onClick={() => setDetailsOpen((current) => !current)} aria-label="Edit wedding details"><Settings2 size={18} /></button>
        </header>
        <div className="ready-layout">
          <section className="ready-intro">
            <p className="eyebrow">{eventDetails.dateLabel || "No session metadata yet"}</p>
            <h1 id="ready-heading">{eventDetails.coupleNames || "Start a new recap"}</h1>
            <p className="event-meta"><strong>{eventDetails.venueName || "No client selected yet"}</strong><br />{eventDetails.cityState || "Add names and venue now, or leave it blank and let us infer from your recording."}</p>
            <div className="intro-rule" />
            <p>Talk through the day in your own order. Add names and venue now, or let us infer from your recording.</p>
            {detailsOpen ? <div className="event-editor"><label>Couple names<input value={eventDetails.coupleNames} onChange={(event) => setEventDetails((current) => ({ ...current, coupleNames: event.target.value }))} /></label><label>Venue<input value={eventDetails.venueName} onChange={(event) => setEventDetails((current) => ({ ...current, venueName: event.target.value }))} /></label><label>City and state<input value={eventDetails.cityState} onChange={(event) => setEventDetails((current) => ({ ...current, cityState: event.target.value }))} /></label><button className="text-icon-button" type="button" onClick={() => setDetailsOpen(false)}><Check size={16} />Done</button></div> : null}
          </section>
          <section className="record-launch-panel">
            <button className="record-launch" type="button" onClick={() => void startRecording()} disabled={recorder.status === "requesting"}><span><Mic size={32} /><small>New tape</small><strong>{recorder.status === "requesting" ? "Opening mic" : "Record recap"}</strong></span></button>
            <p>One tap to start. 4-7 minutes is usually enough.</p>
            <button className="import-button" type="button" onClick={() => fileInputRef.current?.click()}><FileAudio size={16} />Import audio</button>
            {!recorder.isSupported ? <p className="browser-note"><CircleAlert size={14} />Microphone capture is unavailable in this browser.</p> : null}
          </section>
        </div>
        <footer className="ready-footer"><Send size={17} />Finished recaps are delivered to <strong>Michael's editorial desk.</strong></footer>
      </section>
    );
  }

  return (
    <main className={`tape-app ${view === "library" ? "is-library" : ""}`}>
      <a className="skip-link" href="#app-content">Skip to content</a>
      <AppNavigation view={view} onCapture={() => setView("capture")} onLibrary={() => setView("library")} onHelp={() => setHelpOpen(true)} />
      <input ref={fileInputRef} data-testid="audio-input" className="visually-hidden" type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,.webm,.m4a,.mp4,.mp3,.wav" onChange={handleAudioImport} />
      <section id="app-content" className="app-main">
        {view === "library" ? <section className="library-workspace" aria-labelledby="library-heading"><header className="workspace-topbar"><div className="session-location">Library / {history.length} recaps</div><button className="icon-button" type="button" onClick={startNewRecap} aria-label="Start a new recap"><Mic size={18} /></button></header><div className="library-content"><div className="library-heading"><div><p className="eyebrow">Field notes</p><h1 id="library-heading">Your recent tapes</h1><p>Every recap stays available with its delivery outcome on this device.</p></div><button className="primary-button signal-button" type="button" onClick={startNewRecap}><Mic size={16} />New recap</button></div>{historyForDisplay.length ? <div className="library-list">{historyForDisplay.map((entry, index) => <article className="library-row" key={entry.sessionId}><span className="library-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{entry.title}</strong><p>{entry.subtitle}</p></div><time>{new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><span className={`library-status is-${entry.status}`}>{entry.status === "sent" ? "Sent" : entry.status === "ready" ? "Ready" : entry.status === "retry" ? "Needs retry" : "Shaping"}</span>{entry.googleDocUrl ? <a className="library-doc-link" href={entry.googleDocUrl} target="_blank" rel="noreferrer" aria-label={`Open draft for ${entry.title}`}><FileText size={16} /></a> : null}</article>)}</div> : <div className="library-empty"><FileAudio size={34} /><h2>No tapes yet.</h2><p>Your completed recaps will appear here with their delivery status.</p><button className="primary-button signal-button" type="button" onClick={startNewRecap}><Mic size={16} />Record your first recap</button></div>}</div></section> : renderCaptureContent()}
      </section>
      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
      {helpOpen ? <div className="help-backdrop" role="presentation"><section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-heading"><button className="icon-button light-icon-button" type="button" onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={18} /></button><p className="eyebrow">Field note guide</p><h2 id="help-heading">A clean tape makes a strong handoff.</h2><ol><li>Start with the couple, venue, and city.</li><li>Tell the day in whatever order feels natural.</li><li>Use a story cue only when it helps.</li><li>Review the coverage map before sending.</li></ol><button className="primary-button" type="button" onClick={() => setHelpOpen(false)}>Back to recap</button></section></div> : null}
    </main>
  );
}
