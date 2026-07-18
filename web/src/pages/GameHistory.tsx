import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCheck, FaPen, FaTrash } from "react-icons/fa";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";

import ConfirmModal from "../components/ConfirmModal";
import { getApiErrorMessage } from "../lib/apiInstance";
import {
  useDeleteSavedGameMutation,
  useRenameSavedGameMutation,
} from "../mutations/savedGameMutations";
import { useSavedGamesQuery } from "../queries/savedGameQueries";
import { useAuthStore } from "../store/authStore";

export default function GameHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const {
    data: savedGames = [],
    error: savedGamesError,
    isError: savedGamesFailed,
    isPending: loadingSavedGames,
  } = useSavedGamesQuery(userId);
  const { mutate: renameSavedGame, isPending: renamingSavedGame } =
    useRenameSavedGameMutation();
  const { mutate: deleteSavedGame, isPending: deletingSavedGame } =
    useDeleteSavedGameMutation();

  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  function startEditing(gameId: string, currentName: string) {
    setEditingGameId(gameId);
    setEditValue(currentName);

    setTimeout(() => {
      editInputRef.current?.focus();
    }, 0);
  }

  function saveEditName(gameId: string) {
    const trimmed = editValue.trim();

    if (!user) {
      return;
    }

    renameSavedGame(
      { gameId, name: trimmed },
      {
        onSuccess: () => {
          setEditingGameId(null);
          toast.success(t("success.gameRenamed"));
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error));
        },
      },
    );
  }

  function confirmDeleteGame() {
    const gameId = gameToDelete;

    if (!gameId) {
      setGameToDelete(null);

      return;
    }

    deleteSavedGame(gameId, {
      onError: (error) => {
        toast.error(getApiErrorMessage(error));
      },
      onSettled: () => {
        setGameToDelete(null);
      },
    });
  }

  if (!user) {
    return (
      <div className="flex w-[min(100%,50rem)] flex-col items-center gap-6 pt-12 text-center">
        <h1 className="text-2xl font-black text-[#f4f1e8]">
          {t("gameHistory.title")}
        </h1>
        <p className="text-sm text-[#aaa7a0]">
          {t("gameHistory.noUserSelected")}
        </p>
      </div>
    );
  }

  return (
    <Fragment>
      <div className="flex w-[min(100%,50rem)] flex-col gap-6 pt-4">
        <h1 className="text-2xl font-black text-[#f4f1e8]">
          {t("gameHistory.gamesTitle", { name: user.username })}
        </h1>

        {loadingSavedGames ? (
          <p className="text-sm text-[#aaa7a0]">...</p>
        ) : savedGamesFailed ? (
          <p className="text-sm text-[#df5353]">
            {getApiErrorMessage(savedGamesError)}
          </p>
        ) : savedGames.length === 0 ? (
          <p className="text-sm text-[#aaa7a0]">
            {t("gameHistory.noSavedGames")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {savedGames.map((game) => {
              const date = new Date(game.date);

              return (
                <article
                  key={game.id}
                  className="flex min-h-20 w-full items-center gap-4 rounded-lg border border-white/8 bg-[#2a2d28] p-4 text-left transition-colors hover:bg-[#323530]"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                    onClick={() => {
                      navigate("/pgn", { state: { pgn: game.pgn } });
                    }}
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-extrabold text-white">
                        {editingGameId === game.id ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-sm font-extrabold text-white outline-none focus:border-[#628d3f]"
                            value={editValue}
                            onChange={(e) => {
                              setEditValue(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void saveEditName(game.id);
                              }

                              if (e.key === "Escape") {
                                setEditingGameId(null);
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            placeholder={t("gameHistory.namePlaceholder")}
                          />
                        ) : (
                          game.name ||
                          t("gameHistory.vsOpponent", {
                            opponent: game.opponent,
                          })
                        )}
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
                      <span>
                        {t("gameHistory.movesCount", { count: game.moves })}
                      </span>
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
                  </button>

                  <div className="flex shrink-0 gap-2">
                    {editingGameId === game.id ? (
                      <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded border border-white/8 bg-[#628d3f] text-xs font-extrabold text-white transition-colors hover:bg-[#7aad4e]"
                        title={t("common.save")}
                        onClick={() => {
                          saveEditName(game.id);
                        }}
                        disabled={renamingSavedGame}
                      >
                        <FaCheck aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-xs font-extrabold text-[#aaa7a0] transition-colors hover:bg-[#628d3f] hover:text-white"
                        title={t("gameHistory.editGame")}
                        onClick={() => {
                          startEditing(game.id, game.name ?? game.opponent);
                        }}
                      >
                        <FaPen aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-xs font-extrabold text-[#aaa7a0] transition-colors hover:bg-[#df5353] hover:text-white"
                      title={t("gameHistory.deleteGame")}
                      onClick={() => {
                        setGameToDelete(game.id);
                      }}
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={gameToDelete !== null}
        title={t("gameHistory.deleteConfirmTitle")}
        message={t("gameHistory.deleteConfirmMessage")}
        onConfirm={() => {
          confirmDeleteGame();
        }}
        onCancel={() => {
          setGameToDelete(null);
        }}
        confirmDisabled={deletingSavedGame}
      />
    </Fragment>
  );
}
