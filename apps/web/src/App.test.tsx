import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CoverageMap, TranscriptDrawer } from "./App";

describe("Phase 1 and 2 UX", () => {
  it("marks open coverage items as actionable", () => {
    const onOpenRow = vi.fn();

    render(
      <CoverageMap
        recap={undefined}
        activeField={null}
        onOpenRow={onOpenRow}
        onSaveDetail={vi.fn()}
        onCancelDetail={vi.fn()}
        gapDraft=""
        onGapDraftChange={vi.fn()}
      />
    );

    const weatherRow = screen.getByRole("button", { name: /weather/i });
    expect(weatherRow).toBeInTheDocument();
    fireEvent.click(weatherRow);
    expect(onOpenRow).toHaveBeenCalledWith("weather_notes");
  });

  it("shows transcript text in a readable drawer instead of tabular cells", () => {
    render(
      <TranscriptDrawer
        isOpen={true}
        onClose={vi.fn()}
        text="The ceremony started at sunset.\nThe couple exchanged vows in the garden."
      />
    );

    expect(screen.getByRole("dialog", { name: /transcript preview/i })).toBeVisible();
    expect(screen.getByText(/the ceremony started at sunset/i)).toBeVisible();
    expect(screen.getByText(/the couple exchanged vows in the garden/i)).toBeVisible();
  });
});
