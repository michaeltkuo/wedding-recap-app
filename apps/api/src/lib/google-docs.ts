import { google, type docs_v1 } from "googleapis";

import type { BlogOutput } from "../contracts.js";

import { API_CONFIG } from "../config.js";
import { createGoogleOAuthClient, googleAuthStore, isGoogleOAuthConfigured } from "./google-auth.js";

type DocParagraph = {
  text: string;
  style?: "TITLE" | "HEADING_2" | "HEADING_3";
  bold?: boolean;
  italic?: boolean;
  // Character offsets within `text` that should become hyperlinks.
  links?: Array<{ start: number; end: number; url: string }>;
};

function creditParagraph(label: string, name: string, url?: string): DocParagraph {
  const prefix = `${label}: `;
  return {
    text: `${prefix}${name}`,
    links: url ? [{ start: prefix.length, end: prefix.length + name.length, url }] : undefined
  };
}

function settingParagraph(label: string, value: string): DocParagraph {
  return { text: `${label}: ${value}` };
}

// Layout follows Amy's Squarespace order: copy the body block in one go, then fill the settings panel top to bottom.
export function buildPasteSheet(blogOutput: BlogOutput): DocParagraph[] {
  const paragraphs: DocParagraph[] = [{ text: blogOutput.post_title, style: "TITLE" }];

  if (blogOutput.review_flags.length > 0) {
    paragraphs.push({ text: "Check before publishing", style: "HEADING_2" });
    paragraphs.push(...blogOutput.review_flags.map((flag) => ({ text: `• ${flag}` })));
  }

  paragraphs.push({ text: "Body copy (paste into the post)", style: "HEADING_2" });
  paragraphs.push({ text: blogOutput.keyword_line, style: "HEADING_3" });
  paragraphs.push({ text: blogOutput.intro_credit, italic: true });
  paragraphs.push(...blogOutput.opening.map((text) => ({ text })));

  const reviewLink = blogOutput.venue_review_link;
  const reviewParagraph: DocParagraph | undefined = reviewLink
    ? { text: reviewLink.text, italic: true, links: [{ start: 0, end: reviewLink.text.length, url: reviewLink.url }] }
    : undefined;
  if (reviewParagraph && reviewLink?.afterSection === -1) {
    paragraphs.push(reviewParagraph);
  }

  blogOutput.sections.forEach((section, index) => {
    paragraphs.push({ text: section.heading, style: "HEADING_3" });
    paragraphs.push(...section.paragraphs.map((text) => ({ text })));
    if (reviewParagraph && reviewLink?.afterSection === index) {
      paragraphs.push(reviewParagraph);
    }
  });

  paragraphs.push({ text: blogOutput.closing });
  paragraphs.push(...blogOutput.credits.map((credit) => creditParagraph(credit.label, credit.name, credit.url)));
  if (blogOutput.kids_note) {
    paragraphs.push({ text: blogOutput.kids_note, italic: true });
  }

  const { settings } = blogOutput;
  paragraphs.push({ text: "Squarespace settings", style: "HEADING_2" });
  paragraphs.push(
    settingParagraph("Post title", blogOutput.post_title),
    settingParagraph("Hero image alt text", settings.hero_alt_text),
    settingParagraph("Hero image file name (SEO keyword string)", settings.hero_file_name),
    settingParagraph("Image file name prefix", settings.image_file_prefix),
    settingParagraph("Excerpt", settings.excerpt),
    settingParagraph("Post URL", settings.url_slug),
    settingParagraph("Tags", settings.tags.join(", ")),
    settingParagraph("Categories", settings.categories.join(", ")),
    settingParagraph(`SEO title (${settings.seo_title.length} characters)`, settings.seo_title),
    settingParagraph(`SEO description (${settings.seo_description.length} characters)`, settings.seo_description)
  );

  return paragraphs;
}

// One insert, then styles by range. Docs indexes count UTF-16 code units, the same as JS string offsets.
export function buildDocRequests(paragraphs: DocParagraph[]): docs_v1.Schema$Request[] {
  const text = paragraphs.map((paragraph) => `${paragraph.text}\n`).join("");
  const requests: docs_v1.Schema$Request[] = [{ insertText: { location: { index: 1 }, text } }];

  let cursor = 1;
  for (const paragraph of paragraphs) {
    const start = cursor;
    const end = start + paragraph.text.length;
    cursor = end + 1;

    if (paragraph.style) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end + 1 },
          paragraphStyle: { namedStyleType: paragraph.style },
          fields: "namedStyleType"
        }
      });
    }
    if ((paragraph.bold || paragraph.italic) && paragraph.text.length > 0) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end },
          textStyle: { bold: paragraph.bold, italic: paragraph.italic },
          fields: [paragraph.bold ? "bold" : "", paragraph.italic ? "italic" : ""].filter(Boolean).join(",")
        }
      });
    }
    for (const link of paragraph.links ?? []) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start + link.start, endIndex: start + link.end },
          textStyle: { link: { url: link.url } },
          fields: "link"
        }
      });
    }
  }

  return requests;
}

export function canPublishToGoogleDocs() {
  return isGoogleOAuthConfigured() && googleAuthStore.hasConnection();
}

export async function publishGoogleDoc(blogOutput: BlogOutput) {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured");
  }

  const connection = googleAuthStore.getConnection();
  if (!connection) {
    throw new Error("Google OAuth is not connected");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({
    access_token: connection.accessToken,
    expiry_date: connection.expiryDate,
    refresh_token: connection.refreshToken
  });

  const docsApi = google.docs({ auth: client, version: "v1" });
  const driveApi = google.drive({ auth: client, version: "v3" });

  const createdDocument = await docsApi.documents.create({
    requestBody: {
      title: blogOutput.post_title
    }
  });

  const docId = createdDocument.data.documentId;
  if (!docId) {
    throw new Error("Google Docs create did not return a document ID");
  }

  await docsApi.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: buildDocRequests(buildPasteSheet(blogOutput))
    }
  });

  if (API_CONFIG.google.docFolderId.length > 0) {
    await driveApi.files.update({
      fileId: docId,
      addParents: API_CONFIG.google.docFolderId,
      fields: "id, parents"
    });
  }

  return {
    docId,
    url: `https://docs.google.com/document/d/${docId}`,
    status: "ready" as const
  };
}