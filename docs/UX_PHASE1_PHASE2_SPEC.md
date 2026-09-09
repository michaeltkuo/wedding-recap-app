# Phase 1 and 2 Engineering Spec

## Purpose
This document defines the product and engineering behavior for Epic 13, limited to Phase 1 and Phase 2 of the UX hardening effort. It is derived from the Option C mockup and the Phase 1/2 design artifact.

## In scope
- Empty first-load state on initial app render
- Transcript preview interactions and CTA behavior
- Actionable coverage gap rows in review mode
- Inline gap completion without leaving the review screen
- Clear copy and status semantics for captured vs open detail

## Out of scope
- Library reopen/resume state model (Phase 3)
- Full delivery detail redesign
- Backend persistence redesign beyond what is needed to support frontend interaction flow
- New top-level navigation architecture

## Design source of truth
- Primary mockup: reference/ui/mockup-option-c.html
- Phase 1 and 2 artifact: reference/ui/mockup-option-c-phase1-2.html

## Overall product intent
The app should feel like a clean, blank-start workflow instead of a prefilled “studio” view. Review should immediately answer: what facts are captured, what is still missing, and how can the user resolve gaps without leaving the current screen.

The transcript should act like a verification layer, not a separate workflow. The user should be able to open it from either the top-right transcript icon or the “Read transcript” action and land in the same drawer.

Missing coverage should be surfaced as an explicit action opportunity, not a dead label or hidden issue.

---

## UX states

| State key | Trigger | Visible behavior | Primary CTA |
|---|---|---|---|
| ready_empty | New user, no metadata | Blank, no fake names or venue | Record recap |
| ready_named | User enters or imports metadata | Session details visible | Record recap |
| review_map | Pipeline returns review-ready summary | Coverage rows show Captured/Open | Send recap / resolve Open row |
| review_transcript_closed | Review page default | Transcript not open | Read transcript |
| review_transcript_open | User opens transcript | Drawer opens with text preview or unavailable message | Close / Send recap |
| review_gap_editor | User taps an Open row | Inline quick-detail editor appears under row | Save detail / Cancel |
| review_gap_resolved | User saves a detail | Row changes to Captured | Send recap |

---

## State details

### 1. ready_empty
Purpose: first-time/new-user onboarding experience.

Requirements:
- No fake couple names, venue, or city appear automatically.
- The top bar or metadata area should read “New field note” or equivalent neutral label.
- The page invites the user to start a new recap.
- Optional metadata can be surfaced through a settings affordance, not as default visible content.

Acceptance criteria:
- The initial screen contains no real-looking client identity.
- The user can start a recap immediately without editing prefilled fields.
- The screen is still usable before any metadata is entered.

### 2. ready_named
Purpose: optional metadata is now present and visible after user input.

Requirements:
- Once the user enters names, venue, or city, the screen updates to a filled but still simple metadata card.
- The record action remains the primary interaction.
- Metadata remains optional and should not block recording.

Acceptance criteria:
- User-supplied details are displayed clearly.
- No dead controls are present.
- The workflow is still dominated by record/start action.

### 3. review_map
Purpose: show what the recap has captured and what remains open.

Requirements:
- Show a coverage map or list of keyed detail groups.
- Each item is one of:
  - Captured
  - Open
- Open rows must be distinguishable and action-capable.
- The review area must make the missing information obvious without requiring deep navigation.

Acceptance criteria:
- Coverage rows show a clear state and label.
- Open rows are visually and semantically actionable.
- Missing factual detail is visible from the review surface.

### 4. review_transcript_closed / open
Purpose: provide a lightweight verification step before sending.

Requirements:
- Both the transcript top-right icon and the “Read transcript” button open the same transcript drawer.
- The transcript drawer opens as a modal-like panel anchored over the review screen.
- Drawer must support close from:
  - close button
  - escape key
  - optional backdrop click if implemented
- Transcript content should be plain text, not a cell/table layout.
- If transcript is unavailable, show an explicit unavailable notice instead of a blank panel.

Acceptance criteria:
- The same transcript preview opens from both entry points.
- Transcript content is readable raw text, not tabular data.
- The transcript drawer can be dismissed without leaving the review screen.
- A missing transcript does not prevent the user from continuing to Send recap.

### 5. review_gap_editor
Purpose: let the user fix a missing factual detail inline.

Requirements:
- Tapping an Open row expands an inline editor directly under that row.
- The editor contains at minimum:
  - short text input
  - Save detail button
  - Cancel button
- Input is short-form and contextual, not a full form page.
- Save action updates the row to Captured and refreshes the coverage status.

Acceptance criteria:
- A user can resolve a missing detail without leaving the review screen.
- The expanded row remains in context and reads clearly.
- Save detail updates the row to a captured state.

### 6. review_gap_resolved
Purpose: confirm the detail has been fixed and the recap is ready to send.

Requirements:
- The previously Open row transitions to Captured.
- The row summary reflects the saved detail.
- The user can continue to review/send without additional navigation.

Acceptance criteria:
- A saved detail visibly updates the review card.
- The count of found details changes accordingly.
- Send recap remains available.

---

## Screen-by-screen behavior

### Blank/new state
Visual contract:
- neutral background and dark left rail or equivalent minimal studio shell
- no client identity labels
- no hardcoded couple names or city
- no data-preloaded values that look real

Copy:
- Topbar label: New field note
- Heading: Start a new recap
- Meta: No client selected yet
- Prompt: Talk through the day in your own order. Add names and venue now, or let us infer from your recording.
- Primary CTA: Record recap
- Secondary CTA: Import audio

### Review state
Visual contract:
- first row is the overview header “The story is taking shape.”
- coverage rows include a status column or chip
- Open items visually read as actionable, with a clear callout like “Open” or “Tap to add detail”

Copy:
- Captured: detail exists and has been extracted or supplied
- Open: no usable detail found yet
- Helper text: Tap to add detail

### Transcript drawer
Visual contract:
- modal-style panel anchored to the right or top-right of review canvas
- title: Transcript preview
- text rendered in readable paragraphs or raw text blocks
- no spreadsheet-like or cell-based layout

Copy:
- If transcript exists: show raw transcript text
- If transcript is absent: “Transcript is not available yet for this session.”
- Footer or subcopy: “Transcript helps verify details before delivery.”

### Gap quick-fix
Visual contract:
- inline editor appears below the row after interaction
- editor uses a compact input field and save/cancel actions
- the row remains visible and in context

Copy:
- row label remains the same, e.g. Weather
- input placeholder: “Weather detail” or similar short label
- CTA: Save detail

---

## Interaction contract

### Transcript entry points
- The transcript icon in the top-right of the review surface opens the transcript drawer.
- The “Read transcript” button in the review actions opens the same transcript drawer.
- The same transcript content must be shown regardless of which entry point is used.
- Reopening the drawer after dismissal must preserve the same transcript state.

### Missing detail action path
- Clicking or tapping an Open row should expand the inline editor.
- The editor should not navigate away from review.
- Saving a detail should keep the user in the same screen and update the state immediately.

### Send recap behavior
- The user can still send recap when the transcript is unavailable.
- The user can still send recap when there are open rows that have not been resolved yet.
- Missing detail should be surfaced, but it should not hard-block send in Phase 1 and 2 unless product explicitly decides otherwise.

This is the product default for this phase based on the mockup.

---

## Accessibility requirements
- All interactive controls must be reachable via keyboard.
- Open rows should announce expanded/collapsed state through aria-expanded.
- Transcript drawer must have accessible labeling and dialog semantics.
- Focus should move into the transcript drawer when opened and return to the trigger when dismissed.
- Inline editor fields must have visible labels or contextual placeholder text.

---

## Data contract expectations
The Phase 1/2 frontend should be able to handle the following concept shapes:

```ts
interface CoverageRow {
  key: string;
  label: string;
  status: "captured" | "open";
  value?: string;
  open?: boolean;
}

interface TranscriptState {
  available: boolean;
  content?: string;
}

interface ReviewState {
  coverage: CoverageRow[];
  transcript: TranscriptState;
  sessionMeta: {
    names?: string;
    venue?: string;
    city?: string;
  };
}
```

Notes:
- Session metadata remains optional and should not be treated as required for initial render.
- Open rows can be resolved inline without a new page or route.
- Transcript availability is separate from recap send availability.

---

## Implementation notes

### Minimal UI primitives needed
- Transcript drawer component
- Coverage row component with `status` and `actionable` variants
- Inline gap editor component
- Empty-state welcome variant

### Technical constraints
- Keep the existing visual language from Option C.
- Do not introduce Phase 3 library navigation or session restore logic here.
- Keep the logic local to the review surface; no new global app route is required for this phase.
- Reuse the same transcript open event for both transcript entry points.

---

## Acceptance checklist
- Initial page load shows no fake names or venue data.
- The transcript icon and “Read transcript” CTA open the same transcript drawer.
- Transcript preview is readable raw text, not a cell-based layout.
- An unavailable transcript still renders a clear, actionable message.
- Open coverage rows are visually actionable and can be expanded inline.
- Saving a detail changes the row from Open to Captured.
- Users can send recap without transcript data and without resolving all gaps in this phase.
- Mobile and desktop variants both reflect the same UX decisions.

---

## Definition of done
Phase 1 and 2 are complete when:
- the empty-state UX is implemented and validated
- transcript flows are working from both triggers
- coverage gaps are actionable inline
- the review surface is free of dead CTAs
- the implementation matches the approved design artifact and passes QA

## Follow-up note
Phase 3 is intentionally deferred and should be planned after the above flows are stable and accepted.
