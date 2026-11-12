import type { DocumentPickerAsset } from 'expo-document-picker';

/**
 * Text of a file chosen with expo-document-picker in the browser, where the
 * picker hands over a standard web File object.
 * The phone version is in read-picked-file.ts.
 */
export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file) return asset.file.text();
  return (await fetch(asset.uri)).text();
}
