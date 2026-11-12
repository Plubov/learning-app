import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Text of a file chosen with expo-document-picker (Android, iOS). The picker
 * copies the file into the app's cache, where expo-file-system can read it.
 * The browser version is in read-picked-file.web.ts.
 */
export function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}
