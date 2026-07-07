interface Props {
  evaluation: number | null;
  mate: number | null;
  height?: number;
}

export default function EvaluationBar({
  evaluation,
  mate,
  height = 480,
}: Props) {
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

  const pawnText =
    mate !== null
      ? mate > 0
        ? `M${mate}`
        : `-M${Math.abs(mate)}`
      : evaluation !== null
        ? `${evaluation >= 0 ? "+" : ""}${evaluation.toFixed(2)}`
        : null;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ height: `${height}px`, width: "32px" }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-sm border border-gray-700 bg-[#1a1a1a]">
        <div
          className="absolute bottom-0 w-full bg-white transition-all duration-300"
          style={{ height: `${whitePercent}%` }}
        />
        <div className="absolute top-1/2 left-0 h-[1px] w-full bg-gray-500" />
      </div>
      {pawnText && (
        <span className="mt-1 text-xs font-bold text-gray-300 select-none">
          {pawnText}
        </span>
      )}
    </div>
  );
}
