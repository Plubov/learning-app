/**
 * Choosing files on the device and putting them into Storage.
 *
 * Three libraries do the device part:
 *   expo-image-picker        opens the camera or the photo gallery
 *   expo-document-picker     opens the file chooser (for PDFs)
 *   expo-image-manipulator   scales photos down before upload
 * Storage is Supabase's file store: the private bucket "uploads", where each
 * user can only reach the folder named after their own user id.
 */
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { LIMITS } from '@/lib/course-content';
import { splitPdf } from '@/lib/pdf-split';
import { readFileBytes } from '@/lib/read-file-bytes';
import { supabase } from '@/lib/supabase';
import { extensionFor, scaledSize, UPLOAD_TYPES, uploadPath } from '@/lib/upload-path';

const BUCKET = 'uploads';

/** A file chosen on the device, ready to upload. */
export type PickedFile = {
  /** Where the file is on the device (or a blob address in the browser). */
  uri: string;
  name: string;
  mimeType: string;
  /** The browser's own file object, when there is one. */
  file?: File;
  /** The file's bytes, when they are already in memory (a part of a split PDF). */
  bytes?: Uint8Array;
};

/** A PDF larger than this is not opened on the device (it would not fit into memory on a phone). */
const MAX_PDF_BYTES = 60 * 1024 * 1024;

/**
 * The file's bytes as a Uint8Array, which is the form Storage is always
 * given. On a phone the file is read with expo-file-system (see
 * read-file-bytes.ts): `fetch` on a photo's address returned next to
 * nothing there, and a photo arrived in Storage as a 14-byte file.
 */
async function bytesOf(file: PickedFile): Promise<Uint8Array> {
  if (file.bytes) return file.bytes;
  if (file.file) return new Uint8Array(await file.file.arrayBuffer());
  return readFileBytes(file.uri);
}

/** Smaller than any real photo or PDF: such a file was not read from the device properly. */
const MIN_BYTES = 200;

/**
 * The parts a file is uploaded and read in: a photo is one part, a PDF is
 * cut into parts of a few pages (see pdf-split.ts).
 */
export async function partsOf(file: PickedFile): Promise<PickedFile[]> {
  if (file.mimeType !== 'application/pdf') return [file];
  let parts: Uint8Array[];
  try {
    parts = await splitPdf(await bytesOf(file));
  } catch {
    throw new Error(`"${file.name}" could not be opened as a PDF. It may be damaged or protected by a password.`);
  }
  for (const part of parts) {
    if (part.length > LIMITS.uploadBytes) {
      throw new Error(`"${file.name}" has pages that are too large to upload (over 10 MB for a few pages).`);
    }
  }
  return parts.map((bytes) => ({ ...file, file: undefined, bytes }));
}

/** A photo as JPEG with its longer side scaled down; see scaledSize. */
async function preparePhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  const size = scaledSize(asset.width, asset.height);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const name = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '');
  return { uri: saved.uri, name: `${name}.jpg`, mimeType: 'image/jpeg' };
}

/** Opens the camera. Null when the learner cancels; throws when the camera is not allowed. */
export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('The app may not use the camera. Allow it in the device settings.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled || result.assets.length === 0) return null;
  return preparePhoto(result.assets[0]);
}

/** Opens the photo gallery for up to `max` pictures. Empty when the learner cancels. */
export async function choosePhotos(max: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, max).map(preparePhoto));
}

/** Opens the file chooser for one or more PDFs. Empty when the learner cancels. */
export async function chooseDocuments(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true });
  if (result.canceled) return [];
  for (const asset of result.assets) {
    if ((asset.size ?? 0) > MAX_PDF_BYTES) {
      throw new Error(`"${asset.name}" is larger than 60 MB. Split it into chapters and upload those.`);
    }
  }
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: 'application/pdf',
    file: asset.file,
  }));
}

/** Puts a file into the user's folder in Storage and returns its path there. */
export async function uploadFile(courseId: string, file: PickedFile): Promise<string> {
  if (!extensionFor(file.mimeType)) {
    throw new Error(`This kind of file cannot be uploaded. Allowed: ${UPLOAD_TYPES.join(', ')}.`);
  }
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('Not logged in');
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = uploadPath(userId, courseId, file.mimeType, unique);
  // Storage takes the file's bytes; on a phone they are read from its address.
  const body = await bytesOf(file);
  if (body.length < MIN_BYTES) {
    throw new Error(`"${file.name}" could not be read from the device. Try again.`);
  }
  if (body.length > LIMITS.uploadBytes) {
    throw new Error(`"${file.name}" is larger than 10 MB.`);
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: file.mimeType });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Deletes files from Storage. A file that is already gone is not an error. */
export async function removeUploads(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove([...paths]);
  if (error) throw new Error(error.message);
}
