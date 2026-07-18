import { describe, expect, it } from "vitest";

import { decodeBinaryMessage, encodeBinaryMessage } from "./binaryMessage";

describe("binaryMessage", () => {
  it("encodes JSON as UTF-8 binary data", () => {
    const data = encodeBinaryMessage({
      type: "move",
      uci: "e2e4",
      name: "Peão",
    });

    expect(data).toBeInstanceOf(Uint8Array);
    expect(Array.from(data)).toEqual([
      123, 34, 116, 121, 112, 101, 34, 58, 34, 109, 111, 118, 101, 34, 44, 34,
      117, 99, 105, 34, 58, 34, 101, 50, 101, 52, 34, 44, 34, 110, 97, 109, 101,
      34, 58, 34, 80, 101, 195, 163, 111, 34, 125,
    ]);
  });

  it("decodes UTF-8 binary JSON data", () => {
    const message = { type: "analysis", score: 42, pv: ["e2e4"] };

    expect(
      decodeBinaryMessage<typeof message>(encodeBinaryMessage(message).buffer),
    ).toEqual(message);
  });

  it("throws when the binary data is not JSON", () => {
    const data = new Uint8Array([110, 111, 116, 32, 106, 115, 111, 110]);

    expect(() => decodeBinaryMessage(data.buffer)).toThrow(SyntaxError);
  });
});
