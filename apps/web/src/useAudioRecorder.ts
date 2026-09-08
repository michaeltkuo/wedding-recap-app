import { useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused" | "error";

const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function selectMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const resolveStopRef = useRef<((audio: Blob | null) => void) | null>(null);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopMetering() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setLevel(0);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }

  function resetDeviceResources() {
    stopTimer();
    stopMetering();
    stopStream();
    recorderRef.current = null;
    startedAtRef.current = null;
  }

  function beginTimer() {
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);
  }

  function beginMetering(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);
    const updateLevel = () => {
      analyser.getByteTimeDomainData(samples);
      const squareSum = samples.reduce((sum, sample) => {
        const normalized = (sample - 128) / 128;
        return sum + normalized * normalized;
      }, 0);
      setLevel(Math.min(1, Math.sqrt(squareSum / samples.length) * 7));
      animationFrameRef.current = window.requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  async function start() {
    const canRecord =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined";

    if (!canRecord) {
      setError("This browser cannot record audio. Import an audio file instead.");
      setStatus("error");
      return false;
    }

    setError(null);
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = selectMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setElapsedMs(0);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const audio = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
          : null;
        resetDeviceResources();
        setStatus("idle");
        resolveStopRef.current?.(audio);
        resolveStopRef.current = null;
      });

      recorder.start(250);
      beginTimer();
      beginMetering(analyser);
      setStatus("recording");
      return true;
    } catch (recordingError) {
      resetDeviceResources();
      setError(recordingError instanceof Error ? recordingError.message : "Microphone access could not be started.");
      setStatus("error");
      return false;
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    recorder.pause();
    stopTimer();
    stopMetering();
    setStatus("paused");
  }

  function resume() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") {
      return;
    }

    recorder.resume();
    const elapsedBeforeResume = elapsedMs;
    startedAtRef.current = Date.now() - elapsedBeforeResume;
    beginTimer();
    if (analyserRef.current) {
      beginMetering(analyserRef.current);
    }
    setStatus("recording");
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve<Blob | null>(null);
    }

    return new Promise<Blob | null>((resolve) => {
      resolveStopRef.current = resolve;
      recorder.stop();
    });
  }

  function clearError() {
    setError(null);
    if (status === "error") {
      setStatus("idle");
    }
  }

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      resetDeviceResources();
    };
  }, []);

  return {
    status,
    error,
    elapsedMs,
    level,
    isSupported:
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
    start,
    pause,
    resume,
    stop,
    clearError
  };
}