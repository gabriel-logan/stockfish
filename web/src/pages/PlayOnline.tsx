import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDoorOpen, FaFlag, FaPlay, FaSyncAlt, FaWifi } from "react-icons/fa";
import { toast } from "react-toastify";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import MoveList, { type MoveEntry } from "../components/MoveList";
import { baseUrlApiWS } from "../constants";
import { getApiErrorMessage } from "../lib/apiInstance";
import { getGame, resignGame } from "../services/gameService";
import {
  joinMatchmaking,
  joinRoom,
  leaveMatchmaking,
  listRooms,
} from "../services/roomService";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import type { Game, MoveRecord, Room, ServerMessage } from "../types/api";

type OnlineStatus = "idle" | "matching" | "playing" | "finished";
type PromotionPiece = "q" | "r" | "b" | "n";

const ONLINE_STATUS_KEYS = {
  idle: "online.connectionStatus.idle",
  matching: "online.connectionStatus.matching",
  playing: "online.connectionStatus.playing",
  finished: "online.connectionStatus.finished",
} as const satisfies Record<OnlineStatus, string>;

function getLastMove(moves: MoveRecord[]) {
  const lastMove = moves.at(-1);

  if (!lastMove || lastMove.uci.length < 4) {
    return null;
  }

  return {
    from: lastMove.uci.slice(0, 2) as Square,
    to: lastMove.uci.slice(2, 4) as Square,
  };
}

function getMoveEntries(moves: MoveRecord[]): MoveEntry[] {
  return moves.map((move, index) => {
    return {
      san: move.san,
      fen: move.fenAfter,
      color: index % 2 === 0 ? "w" : "b",
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      uci: move.uci,
    };
  });
}

function getGameStatusKey(game: Game | null, userId: string | null) {
  if (!game || !userId) {
    return "online.status.ready";
  }

  if (game.status === "finished") {
    if (game.result === "draw") {
      return "online.status.draw";
    }

    if (
      (game.result === "white_win" && game.whiteUserId === userId) ||
      (game.result === "black_win" && game.blackUserId === userId)
    ) {
      return "online.status.win";
    }

    return "online.status.loss";
  }

  const playerColor = game.whiteUserId === userId ? "white" : "black";

  if (game.sideToMove === playerColor) {
    return "online.status.yourTurn";
  }

  return "online.status.waitingOpponent";
}

function getRoomStatusKey(status: string) {
  if (status === "playing") {
    return "online.roomStatus.playing";
  }

  if (status === "finished") {
    return "online.roomStatus.finished";
  }

  if (status === "cancelled") {
    return "online.roomStatus.cancelled";
  }

  return "online.roomStatus.waiting";
}

export default function PlayOnline() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const pieceSet = useSettingsStore((s) => s.pieceSet);
  const socketRef = useRef<WebSocket | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [status, setStatus] = useState<OnlineStatus>("idle");
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [sendingMove, setSendingMove] = useState(false);

  const currentFen = game?.fen;

  const boardGame = useMemo(() => {
    try {
      if (currentFen) {
        return new Chess(currentFen);
      }

      return new Chess();
    } catch {
      return new Chess();
    }
  }, [currentFen]);

  const orientation = useMemo(() => {
    if (!game || !user) {
      return "w";
    }

    return game.blackUserId === user.id ? "b" : "w";
  }, [game, user]);

  const isPlayerTurn = useMemo(() => {
    if (!game || !user || game.status !== "active") {
      return false;
    }

    if (game.sideToMove === "white") {
      return game.whiteUserId === user.id;
    }

    return game.blackUserId === user.id;
  }, [game, user]);

  const moveEntries = useMemo(() => {
    return getMoveEntries(moves);
  }, [moves]);

  const availableRooms = useMemo(() => {
    if (!user) {
      return rooms;
    }

    return rooms.filter((room) => room.ownerId !== user.id);
  }, [rooms, user]);

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);

    try {
      const nextRooms = await listRooms();
      setRooms(nextRooms);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const handleSocketMessage = useCallback((event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as ServerMessage;

    if (message.type === "game_started") {
      setGame(message.game);
      setStatus("playing");
      socketRef.current?.send(
        JSON.stringify({ type: "join_game", game_id: message.game.id }),
      );
      return;
    }

    if (message.type === "game_state") {
      setGame(message.game);
      setMoves((currentMoves) => {
        if (message.moves.length > 0 || message.game.moveCount === 0) {
          return message.moves;
        }

        return currentMoves;
      });
      setStatus(message.game.status === "finished" ? "finished" : "playing");
      return;
    }

    if (message.type === "move_accepted") {
      setGame(message.game);
      setMoves((currentMoves) => {
        const exists = currentMoves.some((move) => {
          return move.id === message.move_record.id;
        });

        if (exists) {
          return currentMoves;
        }

        return [...currentMoves, message.move_record];
      });
      setSendingMove(false);
      setStatus(message.game.status === "finished" ? "finished" : "playing");
      return;
    }

    if (message.type === "error") {
      setSendingMove(false);
      toast.error(message.message);
    }
  }, []);

  const connectRoomSocket = useCallback(
    (roomId: string) => {
      if (!accessToken) {
        return;
      }

      closeSocket();

      const socket = new WebSocket(
        `${baseUrlApiWS}/ws?token=${encodeURIComponent(accessToken)}`,
      );

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "join_room", room_id: roomId }));
      };

      socket.onmessage = handleSocketMessage;

      socket.onclose = () => {
        setSendingMove(false);
      };

      socketRef.current = socket;
    },
    [accessToken, closeSocket, handleSocketMessage],
  );

  const connectGameSocket = useCallback(
    (gameId: string) => {
      if (!accessToken) {
        return;
      }

      closeSocket();

      const socket = new WebSocket(
        `${baseUrlApiWS}/ws?token=${encodeURIComponent(accessToken)}`,
      );

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "join_game", game_id: gameId }));
      };

      socket.onmessage = handleSocketMessage;

      socket.onclose = () => {
        setSendingMove(false);
      };

      socketRef.current = socket;
    },
    [accessToken, closeSocket, handleSocketMessage],
  );

  useEffect(() => {
    void listRooms()
      .then((nextRooms) => {
        setRooms(nextRooms);
      })
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error));
      });

    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  async function handleJoinMatchmaking() {
    setStatus("matching");

    try {
      const response = await joinMatchmaking();
      setRooms((currentRooms) => {
        const filteredRooms = currentRooms.filter((room) => {
          return room.id !== response.room.id;
        });

        return [response.room, ...filteredRooms];
      });

      if (response.game) {
        const gameResponse = await getGame(response.game.id);
        setGame(gameResponse.game);
        setMoves(gameResponse.moves);
        setStatus("playing");
        connectGameSocket(response.game.id);
        return;
      }

      connectRoomSocket(response.room.id);
      toast.info(t("online.matchmakingJoined"));
    } catch (error) {
      setStatus("idle");
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleJoinRoom(roomId: string) {
    setStatus("matching");

    try {
      const response = await joinRoom(roomId);

      if (response.game) {
        const gameResponse = await getGame(response.game.id);
        setGame(gameResponse.game);
        setMoves(gameResponse.moves);
        setStatus("playing");
        connectGameSocket(response.game.id);
        return;
      }

      connectRoomSocket(response.room.id);
    } catch (error) {
      setStatus("idle");
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleLeaveMatchmaking() {
    try {
      await leaveMatchmaking();
      setStatus("idle");
      await refreshRooms();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleMove(from: Square, to: Square, promotion?: PromotionPiece) {
    if (!game || !socketRef.current || sendingMove) {
      return;
    }

    const uci = `${from}${to}${promotion ?? ""}`;
    setSendingMove(true);
    socketRef.current.send(
      JSON.stringify({
        type: "move",
        game_id: game.id,
        uci,
      }),
    );
    setSelectedSquare(null);
  }

  async function handleResign() {
    if (!game) {
      return;
    }

    try {
      const nextGame = await resignGame(game.id);
      setGame(nextGame);
      setStatus("finished");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <div className="grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_22rem] gap-4 max-[66rem]:grid-cols-1">
      <section className="flex min-w-0 justify-center rounded-md border border-white/8 bg-[#20241f] p-4 shadow-2xl shadow-black/20">
        <Board
          game={boardGame}
          selectedSquare={selectedSquare}
          onSelectSquare={setSelectedSquare}
          onMove={handleMove}
          lastMove={getLastMove(moves)}
          orientation={orientation}
          interactive={isPlayerTurn && !sendingMove}
          pieceSet={pieceSet}
        />
      </section>

      <aside className="grid min-h-[40rem] gap-4">
        <section className="rounded-md border border-white/8 bg-[#20241f] p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-[#f3f1e9]">
                {t("online.title")}
              </h1>
              <p className="text-sm font-bold text-[#aaa7a0]">
                {t(getGameStatusKey(game, user?.id ?? null))}
              </p>
            </div>

            <span className="flex min-h-8 items-center gap-2 rounded border border-white/8 bg-white/5 px-2 text-xs font-extrabold text-[#b7d58a]">
              <FaWifi aria-hidden="true" />
              {t(ONLINE_STATUS_KEYS[status])}
            </span>
          </div>

          <div className="grid gap-2 text-sm font-bold text-[#d9d5ca]">
            <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
              <span>{t("common.user")}</span>
              <strong className="text-[#f3f1e9]">
                {user?.username} ({user?.rating})
              </strong>
            </div>

            {game && (
              <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
                <span>{t("common.color")}</span>
                <strong className="text-[#f3f1e9]">
                  {orientation === "w" ? t("common.white") : t("common.black")}
                </strong>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {status === "matching" ? (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] text-sm font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e]"
                onClick={() => {
                  void handleLeaveMatchmaking();
                }}
              >
                <FaDoorOpen aria-hidden="true" />
                {t("online.leaveQueue")}
              </button>
            ) : (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded bg-[#628d3f] text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e] disabled:opacity-60"
                disabled={status === "playing"}
                onClick={() => {
                  void handleJoinMatchmaking();
                }}
              >
                <FaPlay aria-hidden="true" />
                {t("common.play")}
              </button>
            )}

            <button
              type="button"
              className="flex min-h-10 items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] text-sm font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e]"
              onClick={() => {
                void refreshRooms();
              }}
            >
              <FaSyncAlt aria-hidden="true" />
              {loadingRooms ? "..." : t("online.rooms")}
            </button>

            {game?.status === "active" && (
              <button
                type="button"
                className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded border border-[#df535366] bg-[#3b2525] text-sm font-extrabold text-[#ffd5d5] transition-colors hover:bg-[#df5353] hover:text-white"
                onClick={() => {
                  void handleResign();
                }}
              >
                <FaFlag aria-hidden="true" />
                {t("online.resign")}
              </button>
            )}
          </div>
        </section>

        <section className="min-h-0 rounded-md border border-white/8 bg-[#20241f]">
          <div className="border-b border-white/7 px-4 py-3 text-sm font-extrabold text-[#f3f1e9]">
            {t("common.moves")}
          </div>
          <MoveList
            moves={moveEntries}
            currentMoveIndex={moveEntries.length - 1}
            onGoToMove={() => {}}
            showEvaluation={false}
          />
        </section>

        <section className="rounded-md border border-white/8 bg-[#20241f]">
          <div className="border-b border-white/7 px-4 py-3 text-sm font-extrabold text-[#f3f1e9]">
            {t("online.publicRooms")}
          </div>

          <div className="max-h-44 overflow-y-auto">
            {availableRooms.length === 0 && (
              <p className="p-4 text-sm font-bold text-[#8f8b84]">
                {t("online.noRooms")}
              </p>
            )}

            {availableRooms.map((room) => {
              return (
                <button
                  key={room.id}
                  type="button"
                  className="grid w-full gap-1 border-b border-white/4 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
                  onClick={() => {
                    void handleJoinRoom(room.id);
                  }}
                >
                  <strong className="text-[#f3f1e9]">
                    {room.timeControlSeconds / 60}+{room.incrementSeconds}
                  </strong>
                  <span className="text-xs font-bold text-[#aaa7a0]">
                    {t(getRoomStatusKey(room.status))} ·{" "}
                    {room.rated ? t("online.rated") : t("online.casual")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
