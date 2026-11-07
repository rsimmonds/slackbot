import 'server-only';
import { scrubDocument } from '@cmobeat/ai';
import { audit } from '@cmobeat/db';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { storage } from '@/lib/storage';
import {
  ensureProfile,
  ProfileError,
  readContext,
  requireCandidate,
  writeContext,
} from './profile';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const uploadPurposes = ['resume', 'linkedin_pdf'] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

/** PDFs start with "%PDF-". The declared MIME type and extension are not trusted. */
export function isPdf(bytes: Buffer): boolean {
  return bytes.length > 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Malware scanning hook. The default does nothing; production wires a scanner (for example a
 * ClamAV service or the storage provider's scanning) via setVirusScanner().
 */
export type VirusScanner = (bytes: Buffer) => Promise<{ clean: boolean; reason?: string }>;
let scanner: VirusScanner = async () => ({ clean: true });
export function setVirusScanner(s: VirusScanner) {
  scanner = s;
}

/**
 * Text with its line breaks preserved, so contact lines and addresses at the top of a résumé can
 * be dropped whole. Capped at 20 pages.
 */
export async function extractPdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let page = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      page += item.str;
      page += item.hasEOL ? '\n' : item.str && !item.str.endsWith(' ') ? ' ' : '';
    }
    pages.push(page.replace(/[ \t]+\n/g, '\n').trim());
  }
  return { text: pages.join('\n\n'), pages: pdf.numPages };
}

export interface UploadResult {
  fileId: string;
  pages: number;
  /** Names of protected attributes removed from the extracted text (never the content). */
  removed: string[];
  contextChars: number;
}

export async function uploadProfileDocument(
  viewer: Viewer,
  input: { purpose: UploadPurpose; filename: string; bytes: Buffer },
): Promise<UploadResult> {
  requireCandidate(viewer);
  if (!uploadPurposes.includes(input.purpose)) throw new ProfileError('Unknown upload type.');
  if (input.bytes.length === 0) throw new ProfileError('The file is empty.');
  if (input.bytes.length > MAX_UPLOAD_BYTES)
    throw new ProfileError('Files must be 5 MB or smaller.', 413);
  if (!isPdf(input.bytes))
    throw new ProfileError('Upload a PDF. Other formats are not accepted.', 415);
  const scan = await scanner(input.bytes);
  if (!scan.clean) throw new ProfileError('This file could not be accepted.', 422);

  let extracted: { text: string; pages: number };
  try {
    extracted = await extractPdfText(input.bytes);
  } catch {
    throw new ProfileError('We could not read this PDF. Try exporting it again.', 422);
  }
  const scrubbed = scrubDocument(extracted.text);
  const filename = input.filename.replace(/[^\w .()-]/g, '_').slice(0, 120) || 'document.pdf';

  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    const file = await storage().put(tx, {
      ownerId: viewer.id,
      purpose: input.purpose,
      filename,
      mimeType: 'application/pdf',
      bytes: input.bytes,
    });
    const ctx = await readContext(profile);
    // One current file per purpose: a new résumé replaces the old one.
    for (const old of ctx.files.filter((f) => f.purpose === input.purpose))
      await storage().remove(tx, old.id);
    await writeContext(tx, profile.id, {
      version: 1,
      files: [
        ...ctx.files.filter((f) => f.purpose !== input.purpose),
        {
          id: file.id,
          purpose: input.purpose,
          uploadedAt: new Date().toISOString(),
          pages: extracted.pages,
        },
      ],
      texts: { ...ctx.texts, [input.purpose]: scrubbed.text },
    });
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.upload',
      targetType: 'file',
      targetId: file.id,
      metadata: {
        purpose: input.purpose,
        pages: extracted.pages,
        sizeBytes: input.bytes.length,
        removed: scrubbed.removed,
      },
    });
    return {
      fileId: file.id,
      pages: extracted.pages,
      removed: scrubbed.removed,
      contextChars: scrubbed.text.length,
    };
  });
}

export async function listMyUploads(viewer: Viewer) {
  requireCandidate(viewer);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    return (await readContext(profile)).files;
  });
}
