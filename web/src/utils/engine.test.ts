import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyzeResponse } from "../types/engine";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../lib/engineInstance", () => ({
  default: { post },
}));

import { analyzePosition, getBestScore } from "./engine";

describe("engine API", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("sends an analysis request with the configured depth and multipv", async () => {
    const response: AnalyzeResponse = {
      bestmove: "e2e4",
      analysis: [],
    };
    post.mockResolvedValue({ data: response });

    await expect(analyzePosition("startpos", 18, 3)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith("/analyze", {
      fen: "startpos",
      depth: 18,
      multi_pv: 3,
    });
  });

  it("uses the latest deepest score and mate from the analysis", () => {
    expect(
      getBestScore([
        { type: "analysis", depth: 10, score: 32 },
        { type: "analysis", depth: 12, mate: 4 },
        { type: "analysis", depth: 11, score: 90 },
        { type: "analysis", depth: 12, score: 45 },
      ]),
    ).toEqual({ score: 45, mate: 4 });
  });

  it("returns null scores when the engine has not supplied an evaluation", () => {
    expect(
      getBestScore([{ type: "analysis", depth: 8, pv: ["e2e4"] }]),
    ).toEqual({ score: null, mate: null });
  });
});
