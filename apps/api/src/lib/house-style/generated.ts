import { z } from "zod";

import { EVENT_TYPES, REGION_IDS } from "./config.js";

// What the model is responsible for: prose and word choices. Templated fields are assembled in code.
export const GeneratedPostSchema = z.object({
  title_descriptor: z.string().trim().min(1),
  event_type: z.enum(EVENT_TYPES).default("wedding"),
  keyword_phrase: z.string().trim().min(1),
  intro_descriptor: z.string().trim().min(1),
  slug_terms: z.string().trim().min(1),
  opening: z.array(z.string().trim().min(1)).min(1).max(3),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1),
        paragraphs: z.array(z.string().trim().min(1)).min(1)
      })
    )
    .min(2)
    .max(5),
  closing: z.string().trim().min(1),
  seo_description: z.string().trim().min(1),
  hero_alt_text: z.string().trim().min(1),
  venue_type_term: z.string().trim().min(1).default("unique"),
  tags: z.array(z.string().trim().min(1)).default([]),
  region_guess: z.enum([...REGION_IDS, "none"]).default("none")
});

export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;
