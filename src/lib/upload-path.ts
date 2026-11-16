/**
 * Where an uploaded file goes in Storage. Pure functions, so they can be
 * tested; the uploading is in uploads.ts.
 */

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The file types the upload bucket and the AI reader accept. */
export const UPLOAD_TYPES = Object.keys(EXTENSIONS);

/** The file extension for a media type, or null when the type is not accepted. */
export function extensionFor(mimeType: string): string | null {
  return EXTENSIONS[mimeType.toLowerCase()] ?? null;
}

/**
 * "<user id>/<course id>/<unique>.<ext>". The user id comes first because the
 * bucket's policies give access by the first folder of the path.
 */
export function uploadPath(userId: string, courseId: string, mimeType: string, unique: string): string {
  const extension = extensionFor(mimeType);
  if (!extension) throw new Error('This kind of file cannot be uploaded. Use a photo or a PDF.');
  return `${userId}/${courseId}/${unique}.${extension}`;
}

/** The longer side an image is scaled down to before upload, in pixels. */
export const MAX_IMAGE_SIDE = 1800;

/**
 * The size to scale an image to so that its longer side is at most
 * MAX_IMAGE_SIDE, or null when it is small enough already. Handwriting stays
 * readable at this size, and the upload and the AI call get much cheaper.
 */
export function scaledSize(width: number, height: number): { width: number; height: number } | null {
  const longer = Math.max(width, height);
  if (longer <= MAX_IMAGE_SIDE) return null;
  const factor = MAX_IMAGE_SIDE / longer;
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}
