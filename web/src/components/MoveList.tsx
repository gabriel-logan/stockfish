import { type Ref, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { MoveEntry } from "../types/moves";
import MoveClassificationIcon from "./MoveClassificationIcon";

export type { MoveEntry } from "../types/moves";

interface Props {
  moves: MoveEntry[];
  currentMoveIndex: number;
  onGoToMove: (index: number) => void;
  showEvaluation?: boolean;
}

interface MoveButtonProps {
  move: MoveEntry;
  isActive: boolean;
  moveIndex: number;
  showEvaluation: boolean;
  onGoToMove: (index: number) => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

function getMoveButtonClass(isActive: boolean, isManual: boolean): string {
  const baseClass =
    "inline-flex min-h-7 min-w-0 items-center justify-start gap-1 rounded px-2 text-[#dcd8cf] transition-colors hover:bg-white/7 hover:text-white";

  if (isActive) {
    if (isManual) {
      return `${baseClass} bg-white/14 text-white ring-1 ring-white/14 bg-white/22 ring-white/35`;
    }

    return `${baseClass} bg-[#315da8] text-white`;
  }

  if (isManual) {
    return `${baseClass} bg-white/14 text-white ring-1 ring-white/14`;
  }

  return baseClass;
}

function MoveButton({
  move,
  isActive,
  moveIndex,
  showEvaluation,
  onGoToMove,
  buttonRef,
}: MoveButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={getMoveButtonClass(isActive, !!move.isManual)}
      onClick={() => {
        onGoToMove(moveIndex);
      }}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {move.san}
      </span>
      {showEvaluation && (
        <MoveClassificationIcon
          classification={move.classification}
          size={16}
        />
      )}
      {move.clock && (
        <span className="ml-auto font-mono text-[0.65rem] text-[#9f9b92]">
          {move.clock}
        </span>
      )}
    </button>
  );
}

export default function MoveList({
  moves,
  currentMoveIndex,
  onGoToMove,
  showEvaluation = true,
}: Props) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;

    if (!list || !active) {
      return;
    }

    const activeTop = active.offsetTop;
    const activeBottom = activeTop + active.offsetHeight;
    const visibleTop = list.scrollTop;
    const visibleBottom = visibleTop + list.clientHeight;

    if (activeTop < visibleTop) {
      list.scrollTop = activeTop;
      return;
    }

    if (activeBottom > visibleBottom) {
      list.scrollTop = activeBottom - list.clientHeight;
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
      className="h-full max-h-[28rem] overflow-y-auto text-sm text-[#dcd8cf]"
    >
      {pairs.length === 0 && (
        <p className="m-0 p-5 text-center text-[#8f8b84]">
          {t("moveList.noMovesYet")}
        </p>
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

            <MoveButton
              move={pair.white}
              isActive={isWhiteActive}
              moveIndex={whiteIndex}
              showEvaluation={showEvaluation}
              onGoToMove={onGoToMove}
              buttonRef={isWhiteActive ? activeRef : undefined}
            />

            {pair.black && (
              <MoveButton
                move={pair.black}
                isActive={isBlackActive}
                moveIndex={blackIndex}
                showEvaluation={showEvaluation}
                onGoToMove={onGoToMove}
                buttonRef={isBlackActive ? activeRef : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
