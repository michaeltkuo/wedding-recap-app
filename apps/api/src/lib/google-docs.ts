import { google } from "googleapis";

import type { BlogOutput } from "../contracts.js";

import { API_CONFIG } from "../config.js";
import { createGoogleOAuthClient, googleAuthStore, isGoogleOAuthConfigured } from "./google-auth.js";

function formatBlogOutput(blogOutput: BlogOutput) {
  const sections = blogOutput.section_blocks
    .map((section) => `${section.heading}\n${section.body}`)
    .join("\n\n");

  const imageSlugs = blogOutput.recommended_image_slugs.map((slug) => `- ${slug}`).join("\n");
  const internalLinks = blogOutput.internal_link_suggestions?.map((link) => `- ${link}`).join("\n") ?? "- None";
  const altText = blogOutput.alt_text_suggestions?.map((suggestion) => `- ${suggestion}`).join("\n") ?? "- None";

  return [
    blogOutput.primary_title,
    "",
    blogOutput.meta_description,
    "",
    "Outline",
    blogOutput.h2_outline.map((heading) => `- ${heading}`).join("\n"),
    "",
    "Sections",
    sections,
    "",
    "Recommended image slugs",
    imageSlugs,
    "",
    "Internal link suggestions",
    internalLinks,
    "",
    "Alt text suggestions",
    altText
  ].join("\n");
}

export function buildFallbackGoogleDoc(sessionId: string, status: "ready" | "queued") {
  return {
    docId: sessionId,
    url: `https://docs.google.com/document/d/${sessionId}`,
    status
  } as const;
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
      title: blogOutput.primary_title
    }
  });

  const docId = createdDocument.data.documentId;
  if (!docId) {
    throw new Error("Google Docs create did not return a document ID");
  }

  const documentText = formatBlogOutput(blogOutput);
  await docsApi.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: {
              index: 1
            },
            text: documentText
          }
        }
      ]
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