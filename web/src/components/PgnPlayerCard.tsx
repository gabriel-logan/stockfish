export interface PlayerDisplay {
  color: "w" | "b";
  label: string;
  name: string;
  elo?: string;
  clock: string | null;
}

interface PgnPlayerCardProps {
  player: PlayerDisplay;
  isActive: boolean;
  timeControlLabel: string;
}

export default function PgnPlayerCard({
  player,
  isActive,
  timeControlLabel,
}: PgnPlayerCardProps) {
  return (
    <div
      className={`flex min-h-14 items-center justify-between gap-3 border-y border-white/7 px-3 py-2 ${
        isActive ? "bg-[#2b3327]" : "bg-black/14"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center border border-white/10 text-xs font-black ${
            player.color === "w"
              ? "bg-[#eee6d6] text-[#25211b]"
              : "bg-[#1b1a18] text-[#f5f3ed]"
          }`}
        >
          {player.label[0]}
        </span>

        <div className="min-w-0">
          <div className="overflow-hidden text-sm font-black text-ellipsis whitespace-nowrap text-white">
            {player.name}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-bold text-[#aaa7a0]">
            <span>{player.label}</span>
            <span>{player.elo ? `Elo ${player.elo}` : "Elo -"}</span>
          </div>
        </div>
      </div>

      <div className="min-w-24 border border-white/8 bg-[#111] px-3 py-1.5 text-right font-mono text-xl font-black text-white shadow-[inset_0_-0.12rem_0_rgb(255_255_255_/_8%)]">
        {player.clock ?? timeControlLabel}
      </div>
    </div>
  );
}
