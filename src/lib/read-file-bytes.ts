import { File } from 'expo-file-system';

/**
 * The bytes of a file on the device (Android, iOS), read with
 * expo-file-system. `fetch` on a photo's file address returned an almost
 * empty result on the phone, so it is not used there.
 * The browser version is in read-file-bytes.web.ts.
 */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await new File(uri).arrayBuffer());
}
