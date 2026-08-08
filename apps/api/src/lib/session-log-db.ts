import fs from "node:fs";
import path from "node:path";

import sqlite3 from "sqlite3";

import type { SessionEvent, SessionStage } from "../contracts.js";
import { API_CONFIG } from "../config.js";

sqlite3.verbose();

const dbDir = path.dirname(API_CONFIG.sqlitePath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(API_CONFIG.sqlitePath);

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function all<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows as T[]);
    });
  });
}

let initialized = false;

export async function initializeSessionLogDb() {
  if (initialized) {
    return;
  }

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      final_status TEXT,
      google_doc_url TEXT,
      partial INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      stage_from TEXT NOT NULL,
      stage_to TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS session_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      attempt_no INTEGER NOT NULL,
      success INTEGER NOT NULL,
      error_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id)
    )
  `);

  initialized = true;
}

export async function logSessionCreated(sessionId: string) {
  await initializeSessionLogDb();
  await run(
    `INSERT OR REPLACE INTO sessions (session_id, started_at, partial) VALUES (?, ?, COALESCE((SELECT partial FROM sessions WHERE session_id = ?), 0))`,
    [sessionId, new Date().toISOString(), sessionId]
  );
}

export async function logSessionStageTransition(
  sessionId: string,
  stageFrom: SessionStage,
  stageTo: SessionStage,
  reason?: string
) {
  await initializeSessionLogDb();
  await run(
    `INSERT INTO session_events (session_id, stage_from, stage_to, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
    [sessionId, stageFrom, stageTo, reason ?? null, new Date().toISOString()]
  );
}

export async function logSessionAttempt(
  sessionId: string,
  operationType: "extraction" | "generation" | "publish",
  attemptNo: number,
  success: boolean,
  errorReason?: string
) {
  await initializeSessionLogDb();
  await run(
    `INSERT INTO session_attempts (session_id, operation_type, attempt_no, success, error_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, operationType, attemptNo, success ? 1 : 0, errorReason ?? null, new Date().toISOString()]
  );
}

export async function logSessionFinal(
  sessionId: string,
  finalStatus: SessionStage,
  partial: boolean,
  errorMessage?: string,
  googleDocUrl?: string
) {
  await initializeSessionLogDb();
  await run(
    `UPDATE sessions SET ended_at = ?, final_status = ?, partial = ?, error_message = ?, google_doc_url = ? WHERE session_id = ?`,
    [
      new Date().toISOString(),
      finalStatus,
      partial ? 1 : 0,
      errorMessage ?? null,
      googleDocUrl ?? null,
      sessionId
    ]
  );
}

export async function getSessionTimeline(sessionId: string): Promise<SessionEvent[]> {
  await initializeSessionLogDb();

  type Row = {
    id: number;
    session_id: string;
    stage_from: SessionStage;
    stage_to: SessionStage;
    reason: string | null;
    created_at: string;
  };

  const rows = await all<Row>(
    `SELECT id, session_id, stage_from, stage_to, reason, created_at FROM session_events WHERE session_id = ? ORDER BY id ASC`,
    [sessionId]
  );

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    stageFrom: row.stage_from,
    stageTo: row.stage_to,
    reason: row.reason ?? undefined,
    createdAt: row.created_at
  }));
}
