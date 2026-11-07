import { z } from 'zod';
import { handle, signedIn } from '@/lib/profile/http';
import { ProfileError } from '@/lib/profile/profile';
import { listMyUploads, MAX_UPLOAD_BYTES, uploadProfileDocument, uploadPurposes } from '@/lib/profile/uploads';
import { signedFileUrl } from '@/lib/storage/signed-url';

/** GET /api/profiles/uploads — the candidate's current documents, with short-lived download links. */
export async function GET() {
  return handle(async () => {
    const viewer = await signedIn();
    const items = await listMyUploads(viewer);
    return items.map((f) => ({ ...f, downloadUrl: signedFileUrl(f.id, viewer.id) }));
  });
}

/** POST /api/profiles/uploads — multipart: purpose (resume | linkedin_pdf), file (PDF, ≤ 5 MB). */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await signedIn();
    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new ProfileError('Files must be 5 MB or smaller.', 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ProfileError('Send the file as multipart form data.', 400);
    }
    const purpose = z.enum(uploadPurposes).parse(form.get('purpose'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new ProfileError('Choose a file to upload.', 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    return uploadProfileDocument(viewer, { purpose, filename: file.name, bytes });
  }, 201);
}
