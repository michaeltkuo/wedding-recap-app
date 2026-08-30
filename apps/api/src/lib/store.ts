import type { BlogOutput, Recap, SessionResult, SessionStage, SignUploadResponse, Transcript } from "../contracts.js";

type UploadRecord = SignUploadResponse & {
  sessionId: string;
  mimeType: string;
  sizeBytes: number;
  idempotencyKey: string;
  used: boolean;
  filePath?: string;
  uploadedAt?: string;
};

type SessionInternal = SessionResult & {
  transcriptText?: string;
  contractorToken: string;
  createdAt: number;
  extractAttempts: number;
  generationAttempts: number;
};

export class SessionStore {
  private sessions = new Map<string, SessionInternal>();
  private uploads = new Map<string, UploadRecord>();
  private idempotency = new Map<string, unknown>();

  createSession(sessionId: string, contractorToken: string) {
    const session: SessionInternal = {
      sessionId,
      stage: "idle",
      progressPercent: 0,
      followUps: [],
      partial: false,
      contractorToken,
      createdAt: Date.now(),
      extractAttempts: 0,
      generationAttempts: 0,
      timeline: [],
      retryMetadata: {
        extractionAttempts: 0,
        generationAttempts: 0
      },
      metrics: {
        uploadMs: 0,
        transcriptionMs: 0,
        extractionMs: 0,
        draftMs: 0,
        publishMs: 0
      }
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    return session;
  }

  updateSession(sessionId: string, updates: Partial<SessionInternal>) {
    const next = { ...this.getSession(sessionId), ...updates };
    this.sessions.set(sessionId, next);
    return next;
  }

  updateStage(sessionId: string, stage: SessionStage, progressPercent: number, errorMessage?: string) {
    return this.updateSession(sessionId, { stage, progressPercent, errorMessage });
  }

  saveTranscript(sessionId: string, transcript: Transcript, transcriptText: string) {
    return this.updateSession(sessionId, { transcript, transcriptText });
  }

  saveRecap(sessionId: string, recap: Recap, followUps: SessionResult["followUps"]) {
    return this.updateSession(sessionId, { recap, followUps });
  }

  saveBlogOutput(sessionId: string, blogOutput: BlogOutput) {
    return this.updateSession(sessionId, { blogOutput });
  }

  setFollowUps(sessionId: string, followUps: SessionResult["followUps"], partial = false) {
    return this.updateSession(sessionId, { followUps, partial });
  }

  setUpload(upload: UploadRecord) {
    this.uploads.set(upload.uploadToken, upload);
  }

  private assertUploadNotExpired(uploadToken: string, record: UploadRecord) {
    const expiresAtMs = Date.parse(record.expiresAt);
    if (!Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs) {
      this.uploads.delete(uploadToken);
      throw new Error("Upload token expired");
    }
  }

  getUpload(uploadToken: string) {
    const record = this.uploads.get(uploadToken);
    if (!record) {
      throw new Error("Upload token not found");
    }
    this.assertUploadNotExpired(uploadToken, record);
    return record;
  }

  consumeUpload(uploadToken: string) {
    const record = this.getUpload(uploadToken);
    if (record.used) {
      throw new Error("Upload token already used");
    }
    record.used = true;
    this.uploads.set(uploadToken, record);
    return record;
  }

  markUploadStored(uploadToken: string, filePath: string) {
    const record = this.getUpload(uploadToken);
    record.filePath = filePath;
    record.uploadedAt = new Date().toISOString();
    this.uploads.set(uploadToken, record);
    return record;
  }

  rememberIdempotent<T>(key: string, factory: () => T) {
    if (this.idempotency.has(key)) {
      return this.idempotency.get(key) as T;
    }
    const value = factory();
    this.idempotency.set(key, value);
    return value;
  }

  incrementExtractAttempt(sessionId: string) {
    const session = this.getSession(sessionId);
    session.extractAttempts += 1;
    session.retryMetadata = {
      ...session.retryMetadata,
      extractionAttempts: session.extractAttempts
    };
    this.sessions.set(sessionId, session);
    return session.extractAttempts;
  }

  incrementGenerationAttempt(sessionId: string) {
    const session = this.getSession(sessionId);
    session.generationAttempts += 1;
    session.retryMetadata = {
      ...session.retryMetadata,
      generationAttempts: session.generationAttempts
    };
    this.sessions.set(sessionId, session);
    return session.generationAttempts;
  }
}

export const sessionStore = new SessionStore();