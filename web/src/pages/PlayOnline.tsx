import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCheck,
  FaCircle,
  FaClipboard,
  FaDoorOpen,
  FaFlag,
  FaPlay,
  FaSave,
  FaSyncAlt,
  FaWifi,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import MoveList from "../components/MoveList";
import OnlineGameSetupModal from "../components/OnlineGameSetupModal";
import { baseUrlApiWS } from "../constants";
import { getApiErrorMessage } from "../lib/apiInstance";
import { useResignGameMutation } from "../mutations/gameMutations";
import {
  useJoinMatchmakingMutation,
  useJoinRoomMutation,
  useLeaveMatchmakingMutation,
} from "../mutations/roomMutations";
import { useCreateSavedGameMutation } from "../mutations/savedGameMutations";
import { useRoomsQuery } from "../queries/roomQueries";
import { getGame } from "../services/gameService";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import type {
  Game,
  GameResponse,
  MatchmakingOptions,
  MoveRecord,
  PlayerInfo,
  Room,
  ServerMessage,
} from "../types/api";
import type { PromotionPiece } from "../types/chess-types";
import type { MoveEntry } from "../types/moves";
import {
  decodeBinaryMessage,
  encodeBinaryMessage,
} from "../utils/binaryMessage";
import { getOpeningName } from "../utils/openingNames";
import { formatPgnClock, formatPgnDate } from "../utils/pgn";
import { getGameTermination } from "../utils/playBoard";
import {
  playErrorSound,
  playMoveRecordSound,
  playNotificationSound,
} from "../utils/sounds";

type OnlineStatus = "idle" | "matching" | "playing" | "finished";
type SocketJoinMessage =
  | { type: "join_room"; room_id: string }
  | { type: "join_game"; game_id: string };

const ONLINE_STATUS_KEYS = {
  idle: "online.connectionStatus.idle",
  matching: "online.connectionStatus.matching",
  playing: "online.connectionStatus.playing",
  finished: "online.connectionStatus.finished",
} as const satisfies Record<OnlineStatus, string>;

const EMPTY_ROOMS: Room[] = [];
const DEFAULT_MATCHMAKING_OPTIONS: MatchmakingOptions = {
  rated: false,
  timeControlSeconds: 600,
  incrementSeconds: 0,
};

const DEFAULT_GAME_TIME_CONTROL = {
  timeControlSeconds: DEFAULT_MATCHMAKING_OPTIONS.timeControlSeconds,
  incrementSeconds: DEFAULT_MATCHMAKING_OPTIONS.incrementSeconds,
};

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
      clock: move.clockMs == null ? undefined : formatPgnClock(move.clockMs),
    };
  });
}

function getPlayerForUser(
  whitePlayer: PlayerInfo | null,
  blackPlayer: PlayerInfo | null,
  userId: string | undefined,
) {
  if (whitePlayer?.id === userId) {
    return whitePlayer;
  }

  if (blackPlayer?.id === userId) {
    return blackPlayer;
  }

  return null;
}

function getDisplayedClockMs(
  game: Game,
  color: "white" | "black",
  now: number,
) {
  const storedClockMs =
    color === "white" ? game.whiteClockMs : game.blackClockMs;

  if (game.status !== "active" || game.sideToMove !== color) {
    return Math.max(0, storedClockMs);
  }

  const lastMoveAt = Date.parse(game.lastMoveAt);

  if (Number.isNaN(lastMoveAt)) {
    return Math.max(0, storedClockMs);
  }

  return Math.max(0, storedClockMs - Math.max(0, now - lastMoveAt));
}

function formatClock(clockMs: number) {
  const totalSeconds = Math.ceil(Math.max(0, clockMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function getPgnResult(result: Game["result"] | undefined) {
  if (result === "white_win") {
    return "1-0";
  }

  if (result === "black_win") {
    return "0-1";
  }

  if (result === "draw") {
    return "1/2-1/2";
  }

  return "*";
}

function getPgnTermination(game: Game, position: Chess): string {
  if (game.resultReason === "checkmate") {
    return "Checkmate";
  }

  if (game.resultReason === "timeout") {
    return "Time forfeit";
  }

  if (game.resultReason === "resignation") {
    return "Resignation";
  }

  if (game.resultReason === "disconnection") {
    return "Disconnection";
  }

  if (game.result === "draw" || game.resultReason === "draw") {
    const termination = getGameTermination(position);

    return termination === "Unterminated" ? "Draw" : termination;
  }

  return game.status === "finished" ? "Normal" : "Unterminated";
}

export default function PlayOnline() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateRating = useAuthStore((s) => s.updateRating);
  const pieceSet = useSettingsStore((s) => s.pieceSet);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const socketRef = useRef<WebSocket | null>(null);
  const {
    data: roomsData,
    error: roomsError,
    isError: roomsFailed,
    isFetching: loadingRooms,
    refetch: refetchRooms,
  } = useRoomsQuery(Boolean(accessToken));
  const { mutate: joinMatchmaking, isPending: joiningMatchmaking } =
    useJoinMatchmakingMutation();
  const { mutate: joinRoom, isPending: joiningRoom } = useJoinRoomMutation();
  const { mutate: leaveMatchmaking, isPending: leavingMatchmaking } =
    useLeaveMatchmakingMutation();
  const { mutate: resignGame, isPending: resigningGame } =
    useResignGameMutation();
  const { mutate: saveGame, isPending: savingGame } =
    useCreateSavedGameMutation();
  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [status, setStatus] = useState<OnlineStatus>("idle");
  const [sendingMove, setSendingMove] = useState(false);
  const [whitePlayer, setWhitePlayer] = useState<PlayerInfo | null>(null);
  const [blackPlayer, setBlackPlayer] = useState<PlayerInfo | null>(null);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupModalVersion, setSetupModalVersion] = useState(0);
  const [matchmakingOptions, setMatchmakingOptions] = useState(
    DEFAULT_MATCHMAKING_OPTIONS,
  );
  const [gameTimeControl, setGameTimeControl] = useState(
    DEFAULT_GAME_TIME_CONTROL,
  );
  const finishedSoundGameIdRef = useRef<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const rooms = roomsData ?? EMPTY_ROOMS;
  const joiningGame = joiningMatchmaking || joiningRoom;

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

  const openingName = useMemo(() => {
    if (!game) {
      return null;
    }

    return getOpeningName(game.fen);
  }, [game]);

  const availableRooms = useMemo(() => {
    if (!user) {
      return rooms.filter((room) => room.status === "waiting");
    }

    return rooms.filter(
      (room) => room.status === "waiting" && room.ownerId !== user.id,
    );
  }, [rooms, user]);

  const refreshRooms = useCallback(() => {
    void refetchRooms();
  }, [refetchRooms]);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const handleSocketMessage = useCallback(
    (event: MessageEvent<ArrayBuffer>) => {
      let message: ServerMessage;

      try {
        message = decodeBinaryMessage<ServerMessage>(event.data);
      } catch {
        return;
      }

      if (message.type === "game_started") {
        if (soundEnabled) {
          playNotificationSound();
        }

        queryClient.setQueryData<GameResponse>(["games", message.game.id], {
          game: message.game,
          moves: [],
        });
        setGame(message.game);
        setStatus("playing");
        setSavedGameId(null);
        finishedSoundGameIdRef.current = null;
        socketRef.current?.send(
          encodeBinaryMessage({ type: "join_game", game_id: message.game.id }),
        );
        return;
      }

      if (message.type === "room_updated") {
        queryClient.setQueryData<Room[]>(["rooms"], (currentRooms) => {
          if (!currentRooms) {
            return [message.room];
          }

          const filteredRooms = currentRooms.filter((room) => {
            return room.id !== message.room.id;
          });

          return [message.room, ...filteredRooms];
        });

        return;
      }

      if (message.type === "game_state") {
        if (
          message.game.status === "finished" &&
          soundEnabled &&
          finishedSoundGameIdRef.current !== message.game.id
        ) {
          playNotificationSound();
          finishedSoundGameIdRef.current = message.game.id;
        }

        queryClient.setQueryData<GameResponse>(["games", message.game.id], {
          game: message.game,
          moves: message.moves,
        });
        setGame(message.game);
        setMoves((currentMoves) => {
          if (message.moves.length > 0 || message.game.moveCount === 0) {
            return message.moves;
          }

          return currentMoves;
        });
        setWhitePlayer(message.white_player);
        setBlackPlayer(message.black_player);
        setSendingMove(false);

        const currentPlayer = getPlayerForUser(
          message.white_player,
          message.black_player,
          user?.id,
        );

        if (currentPlayer) {
          updateRating(currentPlayer.rating);
        }

        setStatus(message.game.status === "finished" ? "finished" : "playing");
        return;
      }

      if (message.type === "move_accepted") {
        queryClient.setQueryData<GameResponse>(
          ["games", message.game.id],
          (gameResponse) => {
            const currentMoves = gameResponse?.moves ?? [];
            const moveExists = currentMoves.some((move) => {
              return move.id === message.move_record.id;
            });

            return {
              game: message.game,
              moves: moveExists
                ? currentMoves
                : [...currentMoves, message.move_record],
            };
          },
        );

        if (soundEnabled) {
          let moveIsCheck =
            message.move_record.san.includes("+") ||
            message.move_record.san.includes("#");

          try {
            moveIsCheck = new Chess(message.game.fen).isCheck();
          } catch {
            // Keep the SAN fallback if the position cannot be reconstructed.
          }

          playMoveRecordSound(
            message.move_record.san,
            message.game.status === "finished",
            moveIsCheck,
          );
        }

        if (message.game.status === "finished") {
          finishedSoundGameIdRef.current = message.game.id;
        }

        setGame(message.game);
        if (message.white_player) {
          setWhitePlayer(message.white_player);
        }

        if (message.black_player) {
          setBlackPlayer(message.black_player);
        }

        const currentPlayer = getPlayerForUser(
          message.white_player,
          message.black_player,
          user?.id,
        );

        if (currentPlayer) {
          updateRating(currentPlayer.rating);
        }

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

      if (message.type === "player_disconnected") {
        if (soundEnabled) {
          playNotificationSound();
        }

        toast.error(t("online.opponentDisconnected"));
        setGame((prev) => (prev ? { ...prev, status: "finished" } : prev));
        setStatus("finished");
        return;
      }

      if (message.type === "error") {
        if (soundEnabled) {
          playErrorSound();
        }

        setSendingMove(false);
        toast.error(message.message);
      }
    },
    [queryClient, soundEnabled, t, updateRating, user],
  );

  const connectSocket = useCallback(
    (joinMessage: SocketJoinMessage) => {
      if (!accessToken) {
        return;
      }

      closeSocket();

      const socket = new WebSocket(
        `${baseUrlApiWS}/ws?token=${encodeURIComponent(accessToken)}`,
      );
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        socket.send(encodeBinaryMessage(joinMessage));
      };

      socket.onmessage = handleSocketMessage;

      socket.onclose = () => {
        setSendingMove(false);
      };

      socketRef.current = socket;
    },
    [accessToken, closeSocket, handleSocketMessage],
  );

  const startOnlineGame = useCallback(
    (gameId: string) => {
      return queryClient
        .fetchQuery({
          queryKey: ["games", gameId],
          queryFn: () => {
            return getGame(gameId);
          },
        })
        .then((gameResponse) => {
          setGame(gameResponse.game);
          setMoves(gameResponse.moves);
          setStatus("playing");
          connectSocket({ type: "join_game", game_id: gameId });
        });
    },
    [connectSocket, queryClient],
  );

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  useEffect(() => {
    if (!game || game.status !== "active") {
      return;
    }

    const clockInterval = window.setInterval(() => {
      setClockNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(clockInterval);
    };
  }, [game]);

  function handleJoinMatchmaking(options: MatchmakingOptions) {
    setStatus("matching");

    joinMatchmaking(options, {
      onSuccess: (response) => {
        setGameTimeControl({
          timeControlSeconds: response.room.timeControlSeconds,
          incrementSeconds: response.room.incrementSeconds,
        });

        if (response.game) {
          void startOnlineGame(response.game.id).catch((error: unknown) => {
            setStatus("idle");
            toast.error(getApiErrorMessage(error));
          });

          return;
        }

        connectSocket({ type: "join_room", room_id: response.room.id });
        toast.info(t("online.matchmakingJoined"));
      },
      onError: (error) => {
        setStatus("idle");
        toast.error(getApiErrorMessage(error));
      },
    });
  }

  function handleOpenSetupModal() {
    if (status === "playing" || joiningGame) {
      return;
    }

    setSetupModalVersion((currentVersion) => currentVersion + 1);
    setSetupModalOpen(true);
  }

  function handleConfirmSetup(options: MatchmakingOptions) {
    setMatchmakingOptions(options);
    setSetupModalOpen(false);
    handleJoinMatchmaking(options);
  }

  function handleJoinRoom(roomId: string) {
    setStatus("matching");

    joinRoom(roomId, {
      onSuccess: (response) => {
        setGameTimeControl({
          timeControlSeconds: response.room.timeControlSeconds,
          incrementSeconds: response.room.incrementSeconds,
        });

        if (response.game) {
          void startOnlineGame(response.game.id).catch((error: unknown) => {
            setStatus("idle");
            toast.error(getApiErrorMessage(error));
          });

          return;
        }

        connectSocket({ type: "join_room", room_id: response.room.id });
      },
      onError: (error) => {
        setStatus("idle");
        toast.error(getApiErrorMessage(error));
      },
    });
  }

  function handleLeaveMatchmaking() {
    leaveMatchmaking(undefined, {
      onSuccess: () => {
        setStatus("idle");
        refreshRooms();
      },
      onError: (error) => {
        toast.error(getApiErrorMessage(error));
      },
    });
  }

  function handleMove(from: Square, to: Square, promotion?: PromotionPiece) {
    if (!game || !socketRef.current || sendingMove) {
      return;
    }

    const uci = `${from}${to}${promotion ?? ""}`;
    setSendingMove(true);
    socketRef.current.send(
      encodeBinaryMessage({
        type: "move",
        game_id: game.id,
        uci,
      }),
    );
    setSelectedSquare(null);
  }

  function handleResign() {
    if (!game) {
      return;
    }

    resignGame(game.id, {
      onSuccess: (nextGame) => {
        setGame(nextGame);
        setStatus("finished");

        if (soundEnabled && finishedSoundGameIdRef.current !== nextGame.id) {
          playNotificationSound();
          finishedSoundGameIdRef.current = nextGame.id;
        }
      },
      onError: (error) => {
        toast.error(getApiErrorMessage(error));
      },
    });
  }

  const createPgnWithHeaders = useCallback(() => {
    if (!game) {
      return "";
    }

    const pgnGame = new Chess();

    for (const move of moves) {
      const appliedMove = pgnGame.move(move.uci);

      if (appliedMove && move.clockMs != null) {
        pgnGame.setComment(`[%clk ${formatPgnClock(move.clockMs)}]`);
      }
    }

    const result = getPgnResult(game.result);
    const termination = getPgnTermination(game, pgnGame);

    const white = whitePlayer?.username ?? "White";
    const black = blackPlayer?.username ?? "Black";

    pgnGame.setHeader("Event", "GLFish Online");
    pgnGame.setHeader("Site", "GLFish");
    pgnGame.setHeader("Date", formatPgnDate(new Date()));
    pgnGame.setHeader("Round", "1");
    pgnGame.setHeader(
      "TimeControl",
      `${gameTimeControl.timeControlSeconds}+${gameTimeControl.incrementSeconds}`,
    );
    pgnGame.setHeader("White", white);
    pgnGame.setHeader("Black", black);
    pgnGame.setHeader("Result", result);
    pgnGame.setHeader("Termination", termination);
    pgnGame.setHeader("Annotator", "GLFish");

    if (whitePlayer?.rating) {
      pgnGame.setHeader("WhiteElo", String(whitePlayer.rating));
    }

    if (blackPlayer?.rating) {
      pgnGame.setHeader("BlackElo", String(blackPlayer.rating));
    }

    if (openingName) {
      pgnGame.setHeader("Opening", openingName);
    }

    return pgnGame.pgn();
  }, [game, gameTimeControl, moves, whitePlayer, blackPlayer, openingName]);

  function handleCopyPgn() {
    const pgn = createPgnWithHeaders();

    navigator.clipboard
      .writeText(pgn)
      .then(() => {
        toast.success(t("success.pgnCopied"));
      })
      .catch(() => {});
  }

  function handleSaveGame() {
    if (savedGameId || !user || savingGame) {
      return;
    }

    const pgn = createPgnWithHeaders();
    const result = getPgnResult(game?.result);

    const opponent =
      game && user
        ? game.whiteUserId === user.id
          ? (blackPlayer?.username ?? "Opponent")
          : (whitePlayer?.username ?? "Opponent")
        : "Opponent";

    const playerColor =
      game && user ? (game.whiteUserId === user.id ? "w" : "b") : "w";

    saveGame(
      {
        pgn,
        result,
        opponent,
        opening: openingName ?? undefined,
        playerColor,
        moves: moves.length,
      },
      {
        onSuccess: (savedGame) => {
          setSavedGameId(savedGame.id);
          toast.success(t("success.gameSaved"));
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error));
        },
      },
    );
  }

  const whiteClock = game
    ? formatClock(getDisplayedClockMs(game, "white", clockNow))
    : "--:--";
  const blackClock = game
    ? formatClock(getDisplayedClockMs(game, "black", clockNow))
    : "--:--";

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
          soundEnabled={soundEnabled}
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

          {game && (whitePlayer || blackPlayer) && (
            <div className="mb-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
                <div className="flex items-center gap-2">
                  <FaCircle size={10} color="#f3f1e9" aria-hidden="true" />
                  <span className="font-bold text-[#f3f1e9]">
                    {whitePlayer?.username ?? "..."}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold text-[#f3f1e9]">
                    {whiteClock}
                  </div>
                  <div className="text-xs font-extrabold text-[#aaa7a0]">
                    {whitePlayer?.rating}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
                <div className="flex items-center gap-2">
                  <FaCircle size={10} color="#555" aria-hidden="true" />
                  <span className="font-bold text-[#f3f1e9]">
                    {blackPlayer?.username ?? "..."}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold text-[#f3f1e9]">
                    {blackClock}
                  </div>
                  <div className="text-xs font-extrabold text-[#aaa7a0]">
                    {blackPlayer?.rating}
                  </div>
                </div>
              </div>
            </div>
          )}

          {game && (
            <div className="mb-4 grid gap-2 text-sm font-bold text-[#d9d5ca]">
              <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
                <span>{t("common.color")}</span>
                <strong className="text-[#f3f1e9]">
                  {orientation === "w" ? t("common.white") : t("common.black")}
                </strong>
              </div>

              {openingName && (
                <div className="flex items-center justify-between rounded border border-white/6 bg-[#292d27] px-3 py-2">
                  <span>{t("common.opening")}</span>
                  <strong className="text-right text-xs text-[#f3f1e9]">
                    {openingName}
                  </strong>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            {status === "matching" ? (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] text-sm font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e]"
                onClick={() => {
                  handleLeaveMatchmaking();
                }}
                disabled={leavingMatchmaking}
              >
                <FaDoorOpen aria-hidden="true" />
                {t("online.leaveQueue")}
              </button>
            ) : (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded bg-[#628d3f] text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e] disabled:opacity-60"
                disabled={status === "playing" || joiningGame}
                onClick={() => {
                  handleOpenSetupModal();
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
                refreshRooms();
              }}
              disabled={loadingRooms}
            >
              <FaSyncAlt aria-hidden="true" />
              {loadingRooms ? "..." : t("online.rooms")}
            </button>

            {game?.status === "active" && (
              <button
                type="button"
                className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded border border-[#df535366] bg-[#3b2525] text-sm font-extrabold text-[#ffd5d5] transition-colors hover:bg-[#df5353] hover:text-white"
                onClick={() => {
                  handleResign();
                }}
                disabled={resigningGame}
              >
                <FaFlag aria-hidden="true" />
                {t("online.resign")}
              </button>
            )}

            {status === "finished" && (
              <>
                <button
                  type="button"
                  className="flex min-h-10 items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] text-sm font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e]"
                  onClick={handleCopyPgn}
                >
                  <FaClipboard aria-hidden="true" />
                  {t("playComputer.copyPgn")}
                </button>

                {user && (
                  <button
                    type="button"
                    className={
                      savedGameId
                        ? "flex min-h-10 items-center justify-center gap-2 rounded bg-[#628d3f] text-sm font-extrabold text-white opacity-60"
                        : "flex min-h-10 items-center justify-center gap-2 rounded bg-[#628d3f] text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e]"
                    }
                    onClick={() => {
                      handleSaveGame();
                    }}
                    disabled={savingGame || !!savedGameId}
                  >
                    {savedGameId ? (
                      <FaCheck aria-hidden="true" />
                    ) : (
                      <FaSave aria-hidden="true" />
                    )}
                    {savedGameId ? t("common.saved") : t("common.save")}
                  </button>
                )}
              </>
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
            {roomsFailed ? (
              <p className="p-4 text-sm font-bold text-[#df5353]">
                {getApiErrorMessage(roomsError)}
              </p>
            ) : availableRooms.length === 0 ? (
              <p className="p-4 text-sm font-bold text-[#8f8b84]">
                {t("online.noRooms")}
              </p>
            ) : null}

            {availableRooms.map((room) => {
              return (
                <button
                  key={room.id}
                  type="button"
                  className="grid w-full gap-1 border-b border-white/4 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
                  onClick={() => {
                    handleJoinRoom(room.id);
                  }}
                  disabled={joiningGame || status === "playing"}
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

      <OnlineGameSetupModal
        key={setupModalVersion}
        open={setupModalOpen}
        confirmDisabled={joiningGame}
        initialOptions={matchmakingOptions}
        onConfirm={handleConfirmSetup}
        onCancel={() => {
          setSetupModalOpen(false);
        }}
      />
    </div>
  );
}
