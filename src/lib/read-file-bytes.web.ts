/**
 * The bytes of a chosen file in the browser, where its address is a blob or
 * data address that `fetch` can read.
 * The phone version is in read-file-bytes.ts.
 */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}
