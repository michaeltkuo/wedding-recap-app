import { google } from "googleapis";
import { randomUUID } from "node:crypto";

import type { BlogOutput } from "../contracts.js";
import { API_CONFIG } from "../config.js";

function getGoogleAuth() {
  const clientEmail = API_CONFIG.googleDocs.serviceAccountEmail;
  const privateKeyRaw = API_CONFIG.googleDocs.serviceAccountPrivateKey;
  const oauthClientId = API_CONFIG.googleDocs.oauthClientId;
  const oauthClientSecret = API_CONFIG.googleDocs.oauthClientSecret;
  const oauthRefreshToken = API_CONFIG.googleDocs.oauthRefreshToken;
  const scopes = ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file"];

  if (!clientEmail || !privateKeyRaw) {
    if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
      const oauth2 = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
      oauth2.setCredentials({ refresh_token: oauthRefreshToken });
      return oauth2;
    }

    throw new Error("Google Docs credentials are not configured. Provide service account credentials or Google OAuth credentials before publishing.");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes
  });
}

function blogToDocumentText(output: BlogOutput) {
  const lines: string[] = [output.primary_title, "", output.meta_description, ""];

  output.section_blocks.forEach((section) => {
    lines.push(section.heading);
    lines.push(section.body);
    lines.push("");
  });

  lines.push("Recommended image slugs:");
  output.recommended_image_slugs.forEach((slug) => lines.push(`- ${slug}`));

  if (output.alt_text_suggestions?.length) {
    lines.push("", "Alt text suggestions:");
    output.alt_text_suggestions.forEach((suggestion) => lines.push(`- ${suggestion}`));
  }

  return lines.join("\n");
}

export async function publishDraftToGoogleDoc(output: BlogOutput) {
  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const created = await docs.documents.create({
    requestBody: {
      title: output.primary_title
    }
  });

  const docId = created.data.documentId;
  if (!docId) {
    throw new Error("Google Docs creation returned no document id");
  }

  const documentText = blogToDocumentText(output);
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: documentText
          }
        }
      ]
    }
  });

  if (API_CONFIG.googleDocs.folderId) {
    try {
      await drive.files.update({
        fileId: docId,
        addParents: API_CONFIG.googleDocs.folderId,
        removeParents: "root",
        supportsAllDrives: true,
        fields: "id, webViewLink"
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown folder placement failure";
      throw new Error(
        `Google Drive folder placement failed for GOOGLE_DOCS_FOLDER_ID=${API_CONFIG.googleDocs.folderId}. ${reason}. ` +
        "If your OAuth token only has https://www.googleapis.com/auth/drive.file, it cannot see arbitrary existing folders. " +
        "Re-consent with Drive scope (https://www.googleapis.com/auth/drive) and refresh the stored refresh token. " +
        "Fix by sharing that folder with the Google account tied to GOOGLE_OAUTH_REFRESH_TOKEN (Editor), " +
        "or remove GOOGLE_DOCS_FOLDER_ID to publish to Drive root."
      );
    }
  }

  const metadata = await drive.files.get({ fileId: docId, supportsAllDrives: true, fields: "id, webViewLink" });

  return {
    docId,
    url: metadata.data.webViewLink ?? `https://docs.google.com/document/d/${docId}`,
    status: "ready" as const
  };
}
