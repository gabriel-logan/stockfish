interface Props {
  evaluation: number | null;
  mate: number | null;
}

export default function EvaluationBar({ evaluation, mate }: Props) {
  let whitePercent = 50;

  if (mate !== null) {
    if (mate > 0) {
      whitePercent = 98;
    } else if (mate < 0) {
      whitePercent = 2;
    }
  } else if (evaluation !== null) {
    const clamped = Math.max(-5, Math.min(5, evaluation));

    whitePercent = Math.max(2, Math.min(98, 50 - clamped * 10));
  }

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
