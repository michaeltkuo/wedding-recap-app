import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { WeddingDetailsSchema } from "@wedding/contracts";

import { PostDetailsForm, emptyPostDetails, parseVendorLines, toWeddingDetails, type PostDetailsDraft } from "./PostDetailsForm";

describe("post details intake", () => {
  it("parses vendor lines with websites, Instagram handles, or no link", () => {
    expect(parseVendorLines("Florals: Wendy Anne | wendyanne.com\nHair: Anne Stylezzz | @annestylezzz\nDJ: King Entertainment\nnot a vendor line")).toEqual([
      { role: "Florals", name: "Wendy Anne", url: "https://wendyanne.com/" },
      { role: "Hair", name: "Anne Stylezzz", url: "https://www.instagram.com/annestylezzz/" },
      { role: "DJ", name: "King Entertainment" }
    ]);
  });

  it("produces details the API accepts for Elisha & Thomas", () => {
    const draft: PostDetailsDraft = {
      ...emptyPostDetails,
      partnerOne: "Elisha",
      partnerTwo: "Thomas",
      ceremonyVenue: "St. Augustine Catholic Church & Student Center",
      ceremonyIsHouseOfWorship: true,
      receptionVenue: "Thomas Center",
      city: "Gainesville",
      team: { "michael-kuo": "photo", "austin-taft": "video" },
      howTheyMet: "They met at St. Augustine."
    };

    const details = WeddingDetailsSchema.parse(toWeddingDetails(draft));
    expect(details.ceremonyVenue).toEqual({ name: "St. Augustine Catholic Church & Student Center", kind: "house_of_worship" });
    expect(details.receptionVenue).toEqual({ name: "Thomas Center", kind: "venue" });
    expect(details.state).toBe("FL");
    expect(details.team).toEqual([
      { memberId: "michael-kuo", role: "photo" },
      { memberId: "austin-taft", role: "video" }
    ]);
  });

  it("assigns team roles from the roster", () => {
    let latest = emptyPostDetails;
    function Harness() {
      const [value, setValue] = useState(emptyPostDetails);
      return <PostDetailsForm value={value} onChange={(next) => { latest = next; setValue(next); }} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Austin Taft role"), { target: { value: "video" } });
    fireEvent.change(screen.getByLabelText("Michael Kuo role"), { target: { value: "photo" } });
    fireEvent.change(screen.getByLabelText("Michael Kuo role"), { target: { value: "" } });

    expect(latest.team).toEqual({ "austin-taft": "video" });
  });
});
