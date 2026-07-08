interface Props {
  evaluation: number | null;
  mate: number | null;
}

function getWhitePercentage(evaluation: number | null, mate: number | null) {
  if (mate !== null) {
    if (mate > 0) {
      return 98;
    }

    if (mate < 0) {
      return 2;
    }
  }

  if (evaluation === null) {
    return 50;
  }

  const centipawns = Math.max(-1000, Math.min(1000, evaluation * 100));
  const winningChances = 2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1;
  const percentage = 50 + 50 * winningChances;

  return Math.max(2, Math.min(98, percentage));
}

export default function EvaluationBar({ evaluation, mate }: Props) {
  const whitePercent = getWhitePercentage(evaluation, mate);

  let pawnText = null;

  if (mate !== null) {
    if (mate > 0) {
      pawnText = `M${mate}`;
    } else {
      pawnText = `-M${Math.abs(mate)}`;
    }
  } else if (evaluation !== null) {
    let prefix = "";

    if (evaluation >= 0) {
      prefix = "+";
    }

    pawnText = `${prefix}${evaluation.toFixed(2)}`;
  }

  return (
    <div className="relative flex w-8 min-w-8 flex-col items-center self-stretch max-[44rem]:w-5 max-[44rem]:min-w-5">
      <div className="relative h-full w-full overflow-hidden rounded border border-white/10 bg-[#111]">
        <div
          className="absolute bottom-0 w-full bg-[#f4f2eb] transition-[height] duration-300"
          style={{ height: `${whitePercent}%` }}
        />
        <div className="absolute top-1/2 left-0 h-px w-full bg-black/40" />
      </div>
      {pawnText && (
        <span className="mt-1 text-xs font-black text-[#f1efe6] select-none">
          {pawnText}
        </span>
      )}
    </div>
  );
}
