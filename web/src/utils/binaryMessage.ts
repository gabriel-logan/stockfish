const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBinaryMessage(message: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}

export function decodeBinaryMessage<T>(data: ArrayBufferLike): T {
  return JSON.parse(decoder.decode(data)) as T;
}
