import { TEAM_ROSTER, type TeamMemberId, type TeamRole, type Vendor, type WeddingDetailsInput } from "@wedding/contracts";

export type PostDetailsDraft = {
  partnerOne: string;
  partnerTwo: string;
  ceremonyVenue: string;
  ceremonyIsHouseOfWorship: boolean;
  receptionVenue: string;
  city: string;
  state: string;
  team: Partial<Record<TeamMemberId, TeamRole>>;
  childrenFeatured: boolean;
  howTheyMet: string;
  whyThisVenue: string;
  funFacts: string;
  quotes: string;
  vendors: string;
};

export const emptyPostDetails: PostDetailsDraft = {
  partnerOne: "",
  partnerTwo: "",
  ceremonyVenue: "",
  ceremonyIsHouseOfWorship: false,
  receptionVenue: "",
  city: "",
  state: "FL",
  team: {},
  childrenFeatured: false,
  howTheyMet: "",
  whyThisVenue: "",
  funFacts: "",
  quotes: "",
  vendors: ""
};

const roleLabels: Record<TeamRole, string> = { photo: "Photo", video: "Video", assistant: "Assist" };

function toUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("@")) {
    return `https://www.instagram.com/${trimmed.slice(1)}/`;
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

// One vendor per line: "Florals: Wendy Anne | wendyanne.com" (a website or @instagram handle after the bar is optional).
export function parseVendorLines(text: string): Vendor[] {
  return text.split("\n").flatMap((line) => {
    const [rolePart, rest] = line.split(/:(.*)/s, 2);
    if (!rest?.trim()) {
      return [];
    }
    const [name, link] = rest.split("|").map((part) => part.trim());
    if (!rolePart.trim() || !name) {
      return [];
    }
    const url = toUrl(link);
    return [{ role: rolePart.trim(), name, ...(url ? { url } : {}) }];
  });
}

function lines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function optional(value: string) {
  return value.trim() || undefined;
}

export function toWeddingDetails(draft: PostDetailsDraft): WeddingDetailsInput {
  return {
    partnerOne: optional(draft.partnerOne),
    partnerTwo: optional(draft.partnerTwo),
    ceremonyVenue: draft.ceremonyVenue.trim()
      ? { name: draft.ceremonyVenue.trim(), kind: draft.ceremonyIsHouseOfWorship ? "house_of_worship" : "venue" }
      : undefined,
    receptionVenue: draft.receptionVenue.trim() ? { name: draft.receptionVenue.trim(), kind: "venue" } : undefined,
    city: optional(draft.city),
    state: draft.state.trim().length === 2 ? draft.state.trim().toUpperCase() : undefined,
    team: TEAM_ROSTER.flatMap((member) => {
      const role = draft.team[member.id];
      return role ? [{ memberId: member.id, role }] : [];
    }),
    childrenFeatured: draft.childrenFeatured,
    vendors: parseVendorLines(draft.vendors),
    coupleStory: {
      howTheyMet: optional(draft.howTheyMet),
      whyThisVenue: optional(draft.whyThisVenue),
      funFacts: lines(draft.funFacts),
      quotes: lines(draft.quotes)
    }
  };
}

type PostDetailsFormProps = {
  value: PostDetailsDraft;
  onChange: (next: PostDetailsDraft) => void;
};

export function PostDetailsForm({ value, onChange }: PostDetailsFormProps) {
  function update<Key extends keyof PostDetailsDraft>(key: Key, next: PostDetailsDraft[Key]) {
    onChange({ ...value, [key]: next });
  }

  function setRole(memberId: TeamMemberId, role: TeamRole | "") {
    const team = { ...value.team };
    if (role) {
      team[memberId] = role;
    } else {
      delete team[memberId];
    }
    update("team", team);
  }

  return (
    <div className="post-details">
      <fieldset>
        <legend>Couple</legend>
        <div className="post-details-row">
          <label>Partner 1 (bride)<input value={value.partnerOne} onChange={(event) => update("partnerOne", event.target.value)} /></label>
          <label>Partner 2 (groom)<input value={value.partnerTwo} onChange={(event) => update("partnerTwo", event.target.value)} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Where</legend>
        <label>Ceremony venue (proper name)<input value={value.ceremonyVenue} onChange={(event) => update("ceremonyVenue", event.target.value)} /></label>
        <label className="checkbox-label">
          <input type="checkbox" checked={value.ceremonyIsHouseOfWorship} onChange={(event) => update("ceremonyIsHouseOfWorship", event.target.checked)} />
          Ceremony is at a church or other house of worship
        </label>
        <label>Reception venue (if different)<input value={value.receptionVenue} onChange={(event) => update("receptionVenue", event.target.value)} /></label>
        <div className="post-details-row">
          <label>City<input value={value.city} onChange={(event) => update("city", event.target.value)} /></label>
          <label className="state-field">State<input value={value.state} maxLength={2} onChange={(event) => update("state", event.target.value)} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Author Made team</legend>
        {TEAM_ROSTER.map((member) => (
          <label key={member.id} className="team-row">
            <span>{member.fullName}</span>
            <select aria-label={`${member.fullName} role`} value={value.team[member.id] ?? ""} onChange={(event) => setRole(member.id, event.target.value as TeamRole | "")}>
              <option value="">Not on this wedding</option>
              {(Object.keys(roleLabels) as TeamRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
          </label>
        ))}
        <label className="checkbox-label">
          <input type="checkbox" checked={value.childrenFeatured} onChange={(event) => update("childrenFeatured", event.target.checked)} />
          Children are part of the story (adds the privacy note)
        </label>
      </fieldset>

      <fieldset>
        <legend>Couple story</legend>
        <label>How they met<textarea rows={2} value={value.howTheyMet} onChange={(event) => update("howTheyMet", event.target.value)} /></label>
        <label>Why this venue<textarea rows={2} value={value.whyThisVenue} onChange={(event) => update("whyThisVenue", event.target.value)} /></label>
        <label>Fun facts (one per line)<textarea rows={2} value={value.funFacts} onChange={(event) => update("funFacts", event.target.value)} /></label>
        <label>Quotes from the couple (one per line, word for word)<textarea rows={2} value={value.quotes} onChange={(event) => update("quotes", event.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Vendors</legend>
        <label>One per line, e.g. “Florals: Wendy Anne | wendyanne.com” or “Hair: Anne Stylezzz | @annestylezzz”<textarea rows={4} value={value.vendors} onChange={(event) => update("vendors", event.target.value)} /></label>
      </fieldset>
    </div>
  );
}
