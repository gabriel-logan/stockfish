import { useNavigate } from "react-router";

import { useUserStore } from "../store/userStore";

export default function GameHistory() {
  const navigate = useNavigate();
  const users = useUserStore((s) => s.users);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const deleteGame = useUserStore((s) => s.deleteGame);

  const activeUser = users.find((u) => u.id === activeUserId);

  if (!activeUser) {
    return (
      <div className="flex w-[min(100%,50rem)] flex-col items-center gap-6 pt-12 text-center">
        <h1 className="text-2xl font-black text-[#f4f1e8]">Game History</h1>
        <p className="text-sm text-[#aaa7a0]">
          No user selected. Create or switch to a user in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-[min(100%,50rem)] flex-col gap-6 pt-4">
      <h1 className="text-2xl font-black text-[#f4f1e8]">
        {activeUser.name}'s Games
      </h1>

      {activeUser.games.length === 0 ? (
        <p className="text-sm text-[#aaa7a0]">
          No saved games yet. Play a game and save it!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...activeUser.games].reverse().map((game) => {
            const date = new Date(game.date);

            return (
              <button
                key={game.id}
                type="button"
                className="flex min-h-20 w-full items-center gap-4 rounded-lg border border-white/8 bg-[#2a2d28] p-4 text-left transition-colors hover:bg-[#323530]"
                onClick={() => {
                  navigate("/pgn", { state: { pgn: game.pgn } });
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-extrabold text-white">
                      vs {game.opponent}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        game.result === "1-0"
                          ? game.playerColor === "w"
                            ? "text-[#86a94f]"
                            : "text-[#df5353]"
                          : game.result === "0-1"
                            ? game.playerColor === "b"
                              ? "text-[#86a94f]"
                              : "text-[#df5353]"
                            : game.result === "1/2-1/2"
                              ? "text-[#f2be1f]"
                              : "text-[#aaa7a0]"
                      }`}
                    >
                      {game.result}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#aaa7a0]">
                    {game.opening && <span>{game.opening}</span>}
                    <span>{game.moves} moves</span>
                    <span>
                      {date.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-xs text-[#aaa7a0] transition-colors hover:bg-[#df5353] hover:text-white"
                  title="Delete game"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGame(game.id);
                  }}
                >
                  ×
                </button>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
