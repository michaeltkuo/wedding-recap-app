import { PERFORMANCE_BUDGETS_MS } from "../contracts.js";

export type StageMetricName = "uploadMs" | "transcriptionMs" | "extractionMs" | "draftMs" | "publishMs";

type AggregateMetric = {
  count: number;
  totalMs: number;
  maxMs: number;
};

const emptyAggregate = (): AggregateMetric => ({ count: 0, totalMs: 0, maxMs: 0 });

export class MetricsRegistry {
  private aggregates = {
    uploadMs: emptyAggregate(),
    transcriptionMs: emptyAggregate(),
    extractionMs: emptyAggregate(),
    draftMs: emptyAggregate(),
    publishMs: emptyAggregate()
  };

  record(metric: StageMetricName, valueMs: number) {
    const bucket = this.aggregates[metric];
    bucket.count += 1;
    bucket.totalMs += valueMs;
    bucket.maxMs = Math.max(bucket.maxMs, valueMs);
  }

  snapshot() {
    const alerts: string[] = [];

    if (this.aggregates.transcriptionMs.maxMs > PERFORMANCE_BUDGETS_MS.uploadAndTranscription) {
      alerts.push("transcription budget exceeded");
    }

    if (this.aggregates.extractionMs.maxMs + this.aggregates.draftMs.maxMs > PERFORMANCE_BUDGETS_MS.extractionAndDraft) {
      alerts.push("draft generation budget exceeded");
    }

    const average = (metric: AggregateMetric) => (metric.count === 0 ? 0 : Math.round(metric.totalMs / metric.count));

    return {
      budgets: PERFORMANCE_BUDGETS_MS,
      stages: Object.fromEntries(
        Object.entries(this.aggregates).map(([key, value]) => [
          key,
          {
            count: value.count,
            averageMs: average(value),
            maxMs: value.maxMs
          }
        ])
      ),
      alerts
    };
  }
}