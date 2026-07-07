import { useEffect, useRef } from "react";

import MoveClassificationIcon from "./MoveClassificationIcon";

export interface MoveEntry {
  san: string;
  fen: string;
  color: "w" | "b";
  classification?: string;
  evaluation?: number;
  mate?: number;
}

interface Props {
  moves: MoveEntry[];
  currentMoveIndex: number;
  onGoToMove: (index: number) => void;
  showEvaluation?: boolean;
}

export default function MoveList({
  moves,
  currentMoveIndex,
  onGoToMove,
  showEvaluation = true,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [currentMoveIndex]);

  const pairs: { num: number; white: MoveEntry; black?: MoveEntry }[] = [];

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <div
      ref={listRef}
      className="max-h-[480px] overflow-y-auto rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
    >
      {pairs.length === 0 && (
        <p className="py-4 text-center text-gray-500">No moves yet</p>
      )}
      {pairs.map((pair) => {
        return (
          <div
            key={pair.num}
            className="flex items-start gap-1 border-b border-gray-800 py-1 last:border-0"
          >
            <span className="w-6 text-right text-gray-500">{pair.num}.</span>

            <button
              ref={
                currentMoveIndex === pair.num * 2 - 2 ? activeRef : undefined
              }
              type="button"
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                currentMoveIndex === pair.num * 2 - 2
                  ? "bg-blue-700 text-white"
                  : "text-gray-200 hover:bg-gray-800"
              }`}
              onClick={() => {
                onGoToMove(pair.num * 2 - 2);
              }}
            >
              <span>{pair.white.san}</span>
              {showEvaluation && (
                <MoveClassificationIcon
                  classification={pair.white.classification}
                  size={14}
                />
              )}
            </button>

            {pair.black && (
              <button
                ref={
                  currentMoveIndex === pair.num * 2 - 1 ? activeRef : undefined
                }
                type="button"
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                  currentMoveIndex === pair.num * 2 - 1
                    ? "bg-blue-700 text-white"
                    : "text-gray-200 hover:bg-gray-800"
                }`}
                onClick={() => {
                  onGoToMove(pair.num * 2 - 1);
                }}
              >
                <span>{pair.black.san}</span>
                {showEvaluation && (
                  <MoveClassificationIcon
                    classification={pair.black.classification}
                    size={14}
                  />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
