import { useEffect, useRef } from "react";

import MoveClassificationIcon from "./MoveClassificationIcon";

export interface MoveEntry {
  san: string;
  fen: string;
  color: "w" | "b";
  from?: string;
  to?: string;
  uci?: string;
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

  function getMoveButtonClass(isActive: boolean) {
    let className =
      "inline-flex min-h-7 min-w-0 items-center justify-start gap-1 rounded px-2 text-[#dcd8cf] transition-colors hover:bg-white/7 hover:text-white";

    if (isActive) {
      className = `${className} bg-[#315da8] text-white`;
    }

    return className;
  }

  return (
    <div
      ref={listRef}
      className="h-full max-h-[28rem] overflow-y-auto text-sm text-[#dcd8cf]"
    >
      {pairs.length === 0 && (
        <p className="m-0 p-5 text-center text-[#8f8b84]">No moves yet</p>
      )}
      {pairs.map((pair) => {
        const whiteIndex = pair.num * 2 - 2;
        const blackIndex = pair.num * 2 - 1;
        const isWhiteActive = currentMoveIndex === whiteIndex;
        const isBlackActive = currentMoveIndex === blackIndex;

        return (
          <div
            key={pair.num}
            className="grid min-h-9 grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-white/4 even:bg-white/[2.5%]"
          >
            <span className="text-center text-xs font-extrabold text-[#9f9b92]">
              {pair.num}.
            </span>

            <button
              ref={isWhiteActive ? activeRef : undefined}
              type="button"
              className={getMoveButtonClass(isWhiteActive)}
              onClick={() => {
                onGoToMove(whiteIndex);
              }}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {pair.white.san}
              </span>
              {showEvaluation && (
                <MoveClassificationIcon
                  classification={pair.white.classification}
                  size={16}
                />
              )}
            </button>

            {pair.black && (
              <button
                ref={isBlackActive ? activeRef : undefined}
                type="button"
                className={getMoveButtonClass(isBlackActive)}
                onClick={() => {
                  onGoToMove(blackIndex);
                }}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {pair.black.san}
                </span>
                {showEvaluation && (
                  <MoveClassificationIcon
                    classification={pair.black.classification}
                    size={16}
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
