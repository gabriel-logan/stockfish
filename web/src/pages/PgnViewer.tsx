import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaChartLine,
  FaClipboard,
  FaFastBackward,
  FaFastForward,
  FaRedo,
  FaStepBackward,
  FaStepForward,
  FaVolumeOff,
  FaVolumeUp,
} from "react-icons/fa";
import { useLocation } from "react-router";
import { toast } from "react-toastify";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import {
  PIECE_SETS,
  type PieceSet,
  useSettingsStore,
} from "../store/settingsStore";
import type { ClassificationValue } from "../types/chess-types";
import { AnalysisEngine, type AnalysisLine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";
import { getOpeningKey, getOpeningName } from "../utils/openingNames";
import { playMoveResultSound } from "../utils/sounds";

type PgnSource = "paste" | "lichess" | "chesscom";
type ExternalGame = {
  id: string;
  label: string;
  pgn: string;
};
type PgnMoveInfo = {
  comment?: string;
  clock?: string;
  elapsed?: string;
};
type PgnGameInfo = {
  headers: Record<string, string>;
  moveInfo: PgnMoveInfo[];
};

function getMoveUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

type PromotionPiece = "q" | "r" | "b" | "n";

function getUciMoveParams(uciMove: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uciMove)) {
    return null;
  }

  return {
    from: uciMove.slice(0, 2) as Square,
    to: uciMove.slice(2, 4) as Square,
    promotion: (uciMove.slice(4, 5) || undefined) as PromotionPiece | undefined,
  };
}

function getMoveParams(move: MoveEntry) {
  if (!move.from || !move.to) {
    return null;
  }

  return {
    from: move.from as Square,
    to: move.to as Square,
    promotion: move.uci?.slice(4, 5) || undefined,
  };
}

function getFormattedScore(score: number | null, mate: number | null) {
  if (mate !== null) {
    if (Object.is(mate, -0) || mate === 0) {
      return "M0";
    }

    const prefix = mate > 0 ? "+" : "-";

    return `M${prefix}${Math.abs(mate)}`;
  }

  if (score === null) {
    return "-";
  }

  if (score > 0) {
    return `+${score.toFixed(2)}`;
  }

  return score.toFixed(2);
}

function getSanLine(fen: string, pv: string[]) {
  const game = new Chess(fen);
  const moves: string[] = [];

  for (const uciMove of pv) {
    const params = getUciMoveParams(uciMove);

    if (!params) {
      break;
    }

    try {
      const move = game.move(params);

      if (!move) {
        break;
      }

      moves.push(move.san);
    } catch {
      break;
    }
  }

  return moves;
}

function getPgnHeader(pgn: string, header: string) {
  const match = pgn.match(new RegExp(`\\[${header}\\s+"([^"]*)"\\]`));

  return match?.[1] ?? "";
}

function getKnownHeaderLabel(header: string) {
  const labels: Record<string, string> = {
    Event: "Event",
    Site: "Site",
    Date: "Date",
    Round: "Round",
    White: "White",
    Black: "Black",
    Result: "Result",
    CurrentPosition: "Current position",
    WhiteElo: "White Elo",
    BlackElo: "Black Elo",
    WhiteTitle: "White title",
    BlackTitle: "Black title",
    TimeControl: "Time control",
    Termination: "Termination",
    ECO: "ECO",
    ECOUrl: "ECO URL",
    Opening: "Opening",
    Variant: "Variant",
    UTCDate: "UTC date",
    UTCTime: "UTC time",
    Timezone: "Timezone",
    StartTime: "Start time",
    EndDate: "End date",
    EndTime: "End time",
    Link: "Link",
  };

  return labels[header] ?? header;
}

function getResultLabel(result: string) {
  if (result === "1-0") {
    return "White won";
  }

  if (result === "0-1") {
    return "Black won";
  }

  if (result === "1/2-1/2") {
    return "Draw";
  }

  return result || "-";
}

function getLatestClock(moves: MoveEntry[], color: "w" | "b") {
  for (let index = moves.length - 1; index >= 0; index--) {
    const move = moves[index];

    if (move.color === color && move.clock) {
      return move.clock;
    }
  }

  return null;
}

function formatTimeControl(timeControl: string) {
  if (!timeControl || timeControl === "-") {
    return "-";
  }

  const [baseSeconds, incrementSeconds] = timeControl.split("+");
  const base = Number(baseSeconds);

  if (!Number.isFinite(base)) {
    return timeControl;
  }

  const minutes = Math.floor(base / 60);
  const seconds = base % 60;
  const baseLabel =
    seconds === 0
      ? `${minutes} min`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;

  if (!incrementSeconds) {
    return baseLabel;
  }

  return `${baseLabel} + ${incrementSeconds}s`;
}

function parsePgnHeaders(pgn: string) {
  const headers: Record<string, string> = {};
  const headerRegex = /^\[([A-Za-z0-9_]+)\s+"((?:\\"|[^"])*)"\]$/gm;
  let match = headerRegex.exec(pgn);

  while (match) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
    match = headerRegex.exec(pgn);
  }

  return headers;
}

function stripPgnVariations(movetext: string) {
  let depth = 0;
  let result = "";

  for (const char of movetext) {
    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0) {
      result += char;
    }
  }

  return result;
}

function cleanMoveComment(comment: string) {
  return comment
    .replace(/\[%clk\s+[^\]]+\]/g, "")
    .replace(/\[%emt\s+[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePgnMoveInfo(pgn: string): PgnMoveInfo[] {
  const movetext = stripPgnVariations(pgn.replace(/^\[[^\n]+\]\s*$/gm, ""));
  const tokens = movetext.match(/\{[^}]*\}|\S+/g) ?? [];
  const moveInfo: PgnMoveInfo[] = [];
  let currentMoveIndex = -1;

  for (const token of tokens) {
    if (
      /^\d+\.(\.\.)?$/.test(token) ||
      /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)
    ) {
      continue;
    }

    if (/^\$\d+$/.test(token)) {
      continue;
    }

    if (token.startsWith("{") && token.endsWith("}")) {
      if (currentMoveIndex < 0) {
        continue;
      }

      const rawComment = token.slice(1, -1).trim();
      const clock = rawComment.match(/\[%clk\s+([^\]]+)\]/)?.[1];
      const elapsed = rawComment.match(/\[%emt\s+([^\]]+)\]/)?.[1];
      const comment = cleanMoveComment(rawComment);
      const current = moveInfo[currentMoveIndex] ?? {};

      moveInfo[currentMoveIndex] = {
        ...current,
        clock: clock ?? current.clock,
        elapsed: elapsed ?? current.elapsed,
        comment: [current.comment, comment].filter(Boolean).join(" "),
      };
      continue;
    }

    currentMoveIndex += 1;
    moveInfo[currentMoveIndex] = moveInfo[currentMoveIndex] ?? {};
  }

  return moveInfo;
}

function parsePgnGameInfo(pgn: string): PgnGameInfo {
  return {
    headers: parsePgnHeaders(pgn),
    moveInfo: parsePgnMoveInfo(pgn),
  };
}

function splitPgnList(pgnText: string) {
  return pgnText
    .split(/\n\s*\n(?=\[Event\s+")/g)
    .map((pgn) => {
      return pgn.trim();
    })
    .filter(Boolean);
}

function formatExternalGameLabel(pgn: string, fallback: string) {
  const white = getPgnHeader(pgn, "White") || "White";
  const black = getPgnHeader(pgn, "Black") || "Black";
  const result = getPgnHeader(pgn, "Result") || "*";
  const date = getPgnHeader(pgn, "Date");

  if (date) {
    return `${date} - ${white} vs ${black} ${result}`;
  }

  return `${fallback} - ${white} vs ${black} ${result}`;
}

async function fetchChessComGames(username: string): Promise<ExternalGame[]> {
  const archivesResponse = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );

  if (!archivesResponse.ok) {
    throw new Error("Could not find that Chess.com user.");
  }

  const archivesData = (await archivesResponse.json()) as {
    archives?: string[];
  };
  const archives = archivesData.archives ?? [];

  for (const archiveUrl of archives.slice().reverse()) {
    const gamesResponse = await fetch(archiveUrl);

    if (!gamesResponse.ok) {
      continue;
    }

    const gamesData = (await gamesResponse.json()) as {
      games?: {
        pgn?: string;
        rules?: string;
        end_time?: number;
        white?: { username?: string };
        black?: { username?: string };
      }[];
    };
    const games = (gamesData.games ?? [])
      .filter((game) => {
        return game.rules === "chess" && !!game.pgn;
      })
      .slice()
      .reverse()
      .slice(0, 20);

    if (games.length === 0) {
      continue;
    }

    return games.map((game, index) => {
      const pgn = game.pgn ?? "";
      const date = game.end_time
        ? new Date(game.end_time * 1000).toLocaleDateString()
        : "";
      const white = game.white?.username || getPgnHeader(pgn, "White");
      const black = game.black?.username || getPgnHeader(pgn, "Black");
      const result = getPgnHeader(pgn, "Result") || "*";
      const fallback = date || `Game ${index + 1}`;

      return {
        id: `${game.end_time ?? index}-${index}`,
        label:
          white && black
            ? `${fallback} - ${white} vs ${black} ${result}`
            : formatExternalGameLabel(pgn, fallback),
        pgn,
      };
    });
  }

  return [];
}

async function fetchLichessGames(username: string): Promise<ExternalGame[]> {
  const params = new URLSearchParams({
    max: "20",
    clocks: "true",
    evals: "false",
    opening: "true",
  });
  const response = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`,
    {
      headers: {
        Accept: "application/x-chess-pgn",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Could not load games for that Lichess user.");
  }

  const pgnText = await response.text();

  return splitPgnList(pgnText).map((pgn, index) => {
    return {
      id: `${getPgnHeader(pgn, "Site") || "lichess"}-${index}`,
      label: formatExternalGameLabel(pgn, `Game ${index + 1}`),
      pgn,
    };
  });
}

interface PositionData {
  fen: string;
  san?: string;
  color?: "w" | "b";
  from?: string;
  to?: string;
  uci?: string;
  clock?: string;
  elapsed?: string;
  comment?: string;
  evaluation: number | null;
  mate: number | null;
  bestmove?: string | null;
  lineCount?: number;
  lines?: AnalysisLine[];
  classification?: ClassificationValue;
}

export default function PgnViewer() {
  const { t } = useTranslation();
  const location = useLocation();
  const initialPgn = (location.state as { pgn?: string })?.pgn;

  const [pgnSource, setPgnSource] = useState<PgnSource>("paste");
  const [pgnInput, setPgnInput] = useState(initialPgn ?? "");
  const [externalUsername, setExternalUsername] = useState("");
  const [externalGames, setExternalGames] = useState<ExternalGame[]>([]);
  const [selectedExternalGameId, setSelectedExternalGameId] = useState("");
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pgnGameInfo, setPgnGameInfo] = useState<PgnGameInfo | null>(
    initialPgn ? parsePgnGameInfo(initialPgn) : null,
  );
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [gameAtIdx, setGameAtIdx] = useState(() => {
    return new Chess();
  });
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [practiceMoves, setPracticeMoves] = useState<MoveEntry[]>([]);
  const [practiceCursor, setPracticeCursor] = useState(0);

  const abortRef = useRef(false);
  const {
    showEvaluationBar,
    showMoveEvaluation,
    soundEnabled,
    pieceSet,
    setPieceSet,
    setSoundEnabled,
  } = useSettingsStore();

  const mainLineMoves: MoveEntry[] = positions
    .filter((p): p is PositionData & { san: string; color: "w" | "b" } => {
      return !!p.san && !!p.color;
    })
    .map((p) => {
      return {
        san: p.san,
        fen: p.fen,
        color: p.color,
        from: p.from,
        to: p.to,
        uci: p.uci,
        clock: p.clock,
        elapsed: p.elapsed,
        comment: p.comment,
        classification: p.classification,
        evaluation: p.evaluation ?? undefined,
        mate: p.mate ?? undefined,
      };
    });

  const activePracticeMoves = useMemo(() => {
    return practiceMoves.slice(0, practiceCursor);
  }, [practiceCursor, practiceMoves]);
  const moves =
    positions.length > 0
      ? mainLineMoves
          .slice(0, Math.max(0, currentIdx))
          .concat(activePracticeMoves)
      : activePracticeMoves;
  const latestPracticeMove =
    activePracticeMoves[activePracticeMoves.length - 1];
  const currentEval =
    latestPracticeMove?.evaluation ?? positions[currentIdx]?.evaluation ?? null;
  const currentMate =
    latestPracticeMove?.mate ?? positions[currentIdx]?.mate ?? null;
  const currentFen =
    latestPracticeMove?.fen ?? positions[currentIdx]?.fen ?? gameAtIdx.fen();
  const currentAnalysisPosition =
    activePracticeMoves.length > 0 ? null : positions[currentIdx];
  const currentAnalysisLines = currentAnalysisPosition?.lines ?? [];
  const currentMoveDetails =
    latestPracticeMove ??
    (currentIdx > 0 ? mainLineMoves[currentIdx - 1] : null);
  const headers = pgnGameInfo?.headers ?? {};
  const headerEntries = Object.entries(headers);
  const whiteName = headers.White || "White";
  const blackName = headers.Black || "Black";
  const resultLabel = getResultLabel(headers.Result);
  const timeControlLabel = formatTimeControl(headers.TimeControl);
  const whiteClock = getLatestClock(moves, "w");
  const blackClock = getLatestClock(moves, "b");
  const sideToMove = gameAtIdx.turn() as "w" | "b";
  const boardOrientation = boardFlipped ? "b" : "w";
  const displayTopColor = boardOrientation === "w" ? "b" : "w";
  const displayBottomColor = boardOrientation === "w" ? "w" : "b";
  const playerDetails = {
    w: {
      color: "w" as const,
      label: "White",
      name: whiteName,
      elo: headers.WhiteElo,
      clock: whiteClock,
    },
    b: {
      color: "b" as const,
      label: "Black",
      name: blackName,
      elo: headers.BlackElo,
      clock: blackClock,
    },
  };
  const topPlayer = playerDetails[displayTopColor];
  const bottomPlayer = playerDetails[displayBottomColor];
  const reviewPositionLabel =
    activePracticeMoves.length > 0
      ? `${t("common.moves")} ${moves.length}`
      : positions.length > 0
        ? `${currentIdx}/${positions.length - 1}`
        : t("pgnViewer.ready");

  const squareEvaluations = useMemo(() => {
    const evals: Record<string, ClassificationValue> = {};
    const practiceMove = activePracticeMoves[activePracticeMoves.length - 1];

    if (practiceMove?.to && practiceMove.classification) {
      evals[practiceMove.to] = practiceMove.classification;

      return evals;
    }

    const position = positions[currentIdx];

    if (position?.to && position.classification) {
      evals[position.to] = position.classification;
    }

    return evals;
  }, [positions, currentIdx, activePracticeMoves]);

  const suggestedMove = useMemo(() => {
    if (activePracticeMoves.length > 0) {
      return null;
    }

    const position = positions[currentIdx];
    const previousPosition = positions[currentIdx - 1];

    if (!position?.uci || !previousPosition?.bestmove) {
      return null;
    }

    if (position.uci === previousPosition.bestmove) {
      return null;
    }

    if (!/^[a-h][1-8][a-h][1-8]/.test(previousPosition.bestmove)) {
      return null;
    }

    return {
      from: previousPosition.bestmove.slice(0, 2) as Square,
      to: previousPosition.bestmove.slice(2, 4) as Square,
    };
  }, [activePracticeMoves.length, currentIdx, positions]);

  const openingName = useMemo(() => {
    const fens = positions
      .slice(0, currentIdx + 1)
      .map((position) => position.fen);

    for (const move of activePracticeMoves) {
      fens.push(move.fen);
    }

    if (fens.length === 0) {
      fens.push(currentFen);
    }

    for (let i = fens.length - 1; i >= 0; i--) {
      const name = getOpeningName(fens[i]);

      if (name) {
        return name;
      }
    }

    return null;
  }, [currentFen, positions, currentIdx, activePracticeMoves]);

  const getGameAtMove = useCallback(
    (posIdx: number): Chess => {
      const g = new Chess();
      if (positions.length === 0) {
        return g;
      }

      const startFen = positions[0]?.fen;
      if (startFen && startFen !== new Chess().fen()) {
        try {
          g.load(startFen);
        } catch {
          /* ignore */
        }
      }

      for (let i = 1; i <= posIdx; i++) {
        const p = positions[i];
        if (p?.san) {
          try {
            g.move(p.san);
          } catch {
            break;
          }
        }
      }
      return g;
    },
    [positions],
  );

  const getGameWithPractice = useCallback(
    (cursor: number): Chess => {
      const g = positions.length > 0 ? getGameAtMove(currentIdx) : new Chess();

      for (let i = 0; i < cursor; i++) {
        const params = getMoveParams(practiceMoves[i]);

        if (!params) {
          continue;
        }

        try {
          g.move(params);
        } catch {
          break;
        }
      }

      return g;
    },
    [currentIdx, getGameAtMove, positions.length, practiceMoves],
  );

  const showGame = useCallback((nextGame: Chess) => {
    setGameAtIdx(nextGame);

    const history = nextGame.history({ verbose: true });

    if (history.length > 0) {
      const last = history[history.length - 1];
      setLastMove({ from: last.from as Square, to: last.to as Square });
    } else {
      setLastMove(null);
    }
  }, []);

  const goToPracticeCursor = useCallback(
    (cursor: number) => {
      const nextCursor = Math.max(0, Math.min(cursor, practiceMoves.length));

      setPracticeCursor(nextCursor);
      setSelectedSquare(null);
      showGame(getGameWithPractice(nextCursor));
    },
    [getGameWithPractice, practiceMoves.length, showGame],
  );

  const goToPosition = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= positions.length) {
        return;
      }

      setPracticeMoves([]);
      setPracticeCursor(0);
      setSelectedSquare(null);
      setCurrentIdx(idx);

      const g = getGameAtMove(idx);
      showGame(g);
    },
    [positions, getGameAtMove, showGame],
  );

  const handleLoadPgn = async () => {
    if (!pgnInput.trim()) {
      setError(t("errors.pasteValidPgn"));
      toast.error(t("errors.pasteValidPgn"));
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setProgress(0);
    setCurrentIdx(-1);
    setPositions([]);
    setPracticeMoves([]);
    setPracticeCursor(0);
    setSelectedSquare(null);
    setPgnGameInfo(null);
    abortRef.current = false;

    try {
      const parsedGameInfo = parsePgnGameInfo(pgnInput);
      const game = new Chess();
      game.loadPgn(pgnInput);

      const history = game.history({ verbose: true });
      const posData: PositionData[] = [];

      if (history.length > 0) {
        posData.push({ fen: history[0].before, evaluation: null, mate: null });
        for (const [index, move] of history.entries()) {
          const moveInfo = parsedGameInfo.moveInfo[index] ?? {};

          posData.push({
            fen: move.after,
            san: move.san,
            color: move.color as "w" | "b",
            from: move.from,
            to: move.to,
            uci: getMoveUci(move),
            clock: moveInfo.clock,
            elapsed: moveInfo.elapsed,
            comment: moveInfo.comment,
            evaluation: null,
            mate: null,
          });
        }
      } else {
        posData.push({ fen: game.fen(), evaluation: null, mate: null });
      }

      setProgress(5);
      setPgnGameInfo(parsedGameInfo);
      setPositions([...posData]);

      const engine = new AnalysisEngine();
      await engine.connect();

      for (let i = 0; i < posData.length; i++) {
        if (abortRef.current) {
          break;
        }

        try {
          const result = await engine.analyzePosition(posData[i].fen, 14, 3);

          posData[i].evaluation = result.score;
          posData[i].mate = result.mate;
          posData[i].bestmove = result.bestmove;
          posData[i].lineCount = result.lines.length;
          posData[i].lines = result.lines;

          const color = posData[i].color;

          if (i > 0 && color) {
            const alternativeLine = posData[i - 1].lines?.find((line) => {
              return line.pv[0] !== posData[i].uci;
            });

            posData[i].classification = classifyMove(
              posData[i - 1].evaluation,
              result.score,
              color,
              posData[i - 1].mate,
              result.mate,
              posData[i - 1].bestmove === posData[i].uci,
              posData[i - 1].lineCount === 1,
              getOpeningName(posData[i].fen) !== null,
              {
                fenBefore: posData[i - 1].fen,
                playedMove: posData[i].uci,
                bestLinePvAfter: result.lines[0]?.pv,
                alternativeEvalBefore: alternativeLine?.score,
                alternativeMateBefore: alternativeLine?.mate,
                fenTwoMovesAgo: posData[i - 2]?.fen ?? null,
                previousMove: posData[i - 1].uci ?? null,
              },
            );
          }

          setProgress(5 + ((i + 1) / posData.length) * 90);
          setPositions([...posData]);
        } catch {
          // Skip failed position
        }
      }

      engine.disconnect();

      setPositions([...posData]);
      setProgress(100);
      setIsAnalyzing(false);

      const initialGame = new Chess();
      initialGame.load(posData[0].fen);
      setCurrentIdx(0);
      setGameAtIdx(initialGame);
      setLastMove(null);
      setPracticeMoves([]);
      setPracticeCursor(0);
      setSelectedSquare(null);

      toast.success(t("success.analysisComplete"));
    } catch {
      setError(t("errors.invalidPgn"));
      toast.error(t("errors.invalidPgn"));
      setIsAnalyzing(false);
    }
  };

  const handleBoardMove = useCallback(
    async (from: Square, to: Square, promotion: PromotionPiece = "q") => {
      if (isAnalyzing) {
        return;
      }

      try {
        const boardGame = new Chess(gameAtIdx.fen());
        const fenBefore = boardGame.fen();
        const move = boardGame.move({ from, to, promotion });

        if (!move) {
          return;
        }

        const entry: MoveEntry = {
          san: move.san,
          fen: boardGame.fen(),
          color: move.color as "w" | "b",
          from: move.from,
          to: move.to,
          uci: getMoveUci(move),
          captured: move.captured as MoveEntry["captured"],
          isManual: true,
        };

        setGameAtIdx(boardGame);
        setLastMove({ from: move.from as Square, to: move.to as Square });
        setSelectedSquare(null);
        setPracticeMoves((currentMoves) => {
          return currentMoves.slice(0, practiceCursor).concat(entry);
        });
        setPracticeCursor(practiceCursor + 1);

        if (soundEnabled) {
          playMoveResultSound(move, boardGame);
        }

        const engine = new AnalysisEngine();
        await engine.connect();

        try {
          const before = await engine.analyzePosition(fenBefore, 14, 3);
          const after = await engine.analyzePosition(entry.fen, 14);
          const alternativeLine = before.lines.find((line) => {
            return line.pv[0] !== entry.uci;
          });
          const previousPracticeMove =
            activePracticeMoves[activePracticeMoves.length - 1];
          const previousMainMove =
            positions.length > 0 ? positions[currentIdx]?.uci : null;
          const fenTwoMovesAgo =
            activePracticeMoves[activePracticeMoves.length - 2]?.fen ??
            positions[currentIdx - 1]?.fen ??
            null;
          const classification = classifyMove(
            before.score,
            after.score,
            entry.color,
            before.mate,
            after.mate,
            before.bestmove === entry.uci,
            before.lines.length === 1,
            getOpeningName(entry.fen) !== null,
            {
              fenBefore,
              playedMove: entry.uci,
              bestLinePvAfter: after.lines[0]?.pv,
              alternativeEvalBefore: alternativeLine?.score,
              alternativeMateBefore: alternativeLine?.mate,
              fenTwoMovesAgo,
              previousMove: previousPracticeMove?.uci ?? previousMainMove,
            },
          );

          setPracticeMoves((currentMoves) => {
            const nextMoves = [...currentMoves];
            const moveIndex = practiceCursor;

            if (!nextMoves[moveIndex]) {
              return currentMoves;
            }

            nextMoves[moveIndex] = {
              ...nextMoves[moveIndex],
              classification,
              evaluation: after.score ?? undefined,
              mate: after.mate ?? undefined,
            };

            return nextMoves;
          });
        } finally {
          engine.disconnect();
        }
      } catch {
        // Invalid move or analysis failure
      }
    },
    [
      currentIdx,
      activePracticeMoves,
      gameAtIdx,
      isAnalyzing,
      positions,
      practiceCursor,
      soundEnabled,
    ],
  );

  const goToPreviousMove = useCallback(() => {
    if (practiceCursor > 0) {
      goToPracticeCursor(practiceCursor - 1);
      return;
    }

    goToPosition(currentIdx - 1);
  }, [currentIdx, goToPosition, goToPracticeCursor, practiceCursor]);

  const goToNextMove = useCallback(() => {
    if (practiceCursor < practiceMoves.length) {
      goToPracticeCursor(practiceCursor + 1);
      return;
    }

    goToPosition(currentIdx + 1);
  }, [
    currentIdx,
    goToPosition,
    goToPracticeCursor,
    practiceCursor,
    practiceMoves.length,
  ]);

  const goToFirstMove = useCallback(() => {
    if (practiceCursor > 0) {
      goToPracticeCursor(0);
      return;
    }

    goToPosition(0);
  }, [goToPosition, goToPracticeCursor, practiceCursor]);

  const goToLastMove = useCallback(() => {
    if (practiceCursor < practiceMoves.length) {
      goToPracticeCursor(practiceMoves.length);
      return;
    }

    goToPosition(positions.length - 1);
  }, [
    goToPosition,
    goToPracticeCursor,
    positions.length,
    practiceCursor,
    practiceMoves.length,
  ]);

  function computeAccuracy(moveList: MoveEntry[], color: "w" | "b"): string {
    const good = new Set([
      "excellent",
      "best",
      "forced",
      "opening",
      "perfect",
      "splendid",
    ]);

    const playerMoves = moveList.filter((m) => {
      return m.color === color;
    });

    if (playerMoves.length === 0) {
      return "-";
    }

    const goodMoves = playerMoves.filter((m) => {
      return m.classification && good.has(m.classification);
    });

    return ((goodMoves.length / playerMoves.length) * 100).toFixed(1);
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPgnInput(text);
      setPgnGameInfo(parsePgnGameInfo(text));
      toast.success(t("success.pgnPasted"));
    } catch {
      setError(t("errors.cannotAccessClipboard"));
      toast.error(t("errors.cannotAccessClipboard"));
    }
  };

  const handleLoadExternalGames = async () => {
    const username = externalUsername.trim();

    if (!username) {
      setError("Enter a username to load games.");
      return;
    }

    setError(null);
    setIsLoadingGames(true);
    setExternalGames([]);
    setSelectedExternalGameId("");
    setPgnInput("");
    setPgnGameInfo(null);

    try {
      const loadedGames =
        pgnSource === "chesscom"
          ? await fetchChessComGames(username)
          : await fetchLichessGames(username);

      if (loadedGames.length === 0) {
        setError("No public games found for that user.");
        return;
      }

      setExternalGames(loadedGames);
      setSelectedExternalGameId(loadedGames[0].id);
      setPgnInput(loadedGames[0].pgn);
      setPgnGameInfo(parsePgnGameInfo(loadedGames[0].pgn));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load games.";

      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingGames(false);
    }
  };

  const iconActionButtonClass =
    "inline-flex min-h-11 w-13 items-center justify-center rounded-md border border-white/8 bg-linear-to-b from-[#3c3a36] to-[#302e2a] text-lg font-extrabold text-[#f4f1e8] shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#484640] hover:to-[#383631] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid w-[min(100%,108rem)] grid-cols-[minmax(0,1fr)_minmax(20rem,31.25rem)] gap-4 max-[72rem]:grid-cols-1">
      <div className="flex min-w-0 flex-col items-center gap-3">
        {error && (
          <div className="w-[min(100%,50rem)] rounded-md border border-red-300/25 bg-[#5a201c] px-4 py-3 text-center text-sm font-bold text-[#ffd8d4]">
            {error}
          </div>
        )}

        <div className="flex w-[min(100%,50rem)] items-center justify-between gap-3 text-sm font-extrabold text-[#f5f3ed]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-white">
              <FaChartLine aria-hidden="true" />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {t("pgnViewer.gameReview")}
            </span>
          </div>

          <span>{reviewPositionLabel}</span>
        </div>

        <div className="w-[min(100%,50rem)]">
          {pgnGameInfo && (
            <div
              className={`flex min-h-14 items-center justify-between gap-3 border-y border-white/7 px-3 py-2 ${
                topPlayer.color === sideToMove && !gameAtIdx.isGameOver()
                  ? "bg-[#2b3327]"
                  : "bg-black/14"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center border border-white/10 text-xs font-black ${
                    topPlayer.color === "w"
                      ? "bg-[#eee6d6] text-[#25211b]"
                      : "bg-[#1b1a18] text-[#f5f3ed]"
                  }`}
                >
                  {topPlayer.label[0]}
                </span>

                <div className="min-w-0">
                  <div className="overflow-hidden text-sm font-black text-ellipsis whitespace-nowrap text-white">
                    {topPlayer.name}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-bold text-[#aaa7a0]">
                    <span>{topPlayer.label}</span>
                    <span>
                      {topPlayer.elo ? `Elo ${topPlayer.elo}` : "Elo -"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="min-w-24 border border-white/8 bg-[#111] px-3 py-1.5 text-right font-mono text-xl font-black text-white shadow-[inset_0_-0.12rem_0_rgb(255_255_255_/_8%)]">
                {topPlayer.clock ?? timeControlLabel}
              </div>
            </div>
          )}

          <div className="flex min-w-0 items-stretch justify-center gap-2 py-2 max-[44rem]:gap-1">
            {showEvaluationBar && (
              <EvaluationBar evaluation={currentEval} mate={currentMate} />
            )}

            <Board
              game={gameAtIdx}
              onMove={handleBoardMove}
              selectedSquare={selectedSquare}
              onSelectSquare={setSelectedSquare}
              lastMove={lastMove}
              suggestedMove={suggestedMove}
              orientation={boardOrientation}
              interactive={!isAnalyzing}
              squareEvaluations={squareEvaluations}
              showEvaluationIcons={showMoveEvaluation}
              soundEnabled={soundEnabled}
              pieceSet={pieceSet}
            />
          </div>

          {pgnGameInfo && (
            <div
              className={`flex min-h-14 items-center justify-between gap-3 border-y border-white/7 px-3 py-2 ${
                bottomPlayer.color === sideToMove && !gameAtIdx.isGameOver()
                  ? "bg-[#2b3327]"
                  : "bg-black/14"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center border border-white/10 text-xs font-black ${
                    bottomPlayer.color === "w"
                      ? "bg-[#eee6d6] text-[#25211b]"
                      : "bg-[#1b1a18] text-[#f5f3ed]"
                  }`}
                >
                  {bottomPlayer.label[0]}
                </span>

                <div className="min-w-0">
                  <div className="overflow-hidden text-sm font-black text-ellipsis whitespace-nowrap text-white">
                    {bottomPlayer.name}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-bold text-[#aaa7a0]">
                    <span>{bottomPlayer.label}</span>
                    <span>
                      {bottomPlayer.elo ? `Elo ${bottomPlayer.elo}` : "Elo -"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="min-w-24 border border-white/8 bg-[#111] px-3 py-1.5 text-right font-mono text-xl font-black text-white shadow-[inset_0_-0.12rem_0_rgb(255_255_255_/_8%)]">
                {bottomPlayer.clock ?? timeControlLabel}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2 rounded-md border border-[#accc821a] bg-[#1d211d] p-2">
          <button
            type="button"
            className={iconActionButtonClass}
            onClick={goToFirstMove}
            disabled={
              positions.length > 0
                ? currentIdx <= 0 && practiceCursor === 0
                : practiceCursor === 0
            }
            title={t("pgnViewer.firstMove")}
          >
            <FaFastBackward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={goToPreviousMove}
            disabled={
              positions.length > 0
                ? currentIdx <= 0 && practiceCursor === 0
                : practiceCursor === 0
            }
            title={t("pgnViewer.previousMove")}
          >
            <FaStepBackward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={goToNextMove}
            disabled={
              practiceCursor < practiceMoves.length
                ? false
                : currentIdx >= positions.length - 1
            }
            title={t("pgnViewer.nextMove")}
          >
            <FaStepForward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              setBoardFlipped((current) => {
                return !current;
              });
            }}
            title={t("playComputer.flipBoard")}
          >
            <FaRedo aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={goToLastMove}
            disabled={
              practiceCursor < practiceMoves.length
                ? false
                : currentIdx >= positions.length - 1
            }
            title={t("pgnViewer.lastMove")}
          >
            <FaFastForward aria-hidden="true" />
          </button>
        </div>

        <div className="flex w-[min(100%,50rem)] flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/7 bg-black/12 px-3 py-2 text-xs font-bold text-[#cbc8c0]">
          <span className="font-extrabold text-[#aaa7a0] uppercase">
            {headers.Result ? resultLabel : "Analysis"}
          </span>

          {currentMoveDetails && (
            <span className="font-mono text-[#f5f3ed]">
              {currentMoveDetails.san}
              {currentMoveDetails.clock ? ` · ${currentMoveDetails.clock}` : ""}
            </span>
          )}

          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {openingName
              ? t(`openings.${getOpeningKey(openingName)}`)
              : t("pgnViewer.openingNotDetected")}
          </span>

          {headers.Termination && (
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#aaa7a0]">
              {headers.Termination}
            </span>
          )}

          {(headers.Link || headers.ECOUrl) && (
            <a
              className="ml-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#9ac45c] hover:text-[#b9de82]"
              href={headers.Link || headers.ECOUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open game
            </a>
          )}
        </div>

        {currentMoveDetails?.comment && (
          <div className="w-[min(100%,50rem)] border-b border-white/7 px-3 pb-2 text-xs font-bold text-[#dcd8cf]">
            {currentMoveDetails.comment}
          </div>
        )}

        {positions.length === 0 && moves.length === 0 && !isAnalyzing && (
          <div className="px-4 py-8 text-center text-[0.95rem] leading-relaxed text-[#aaa7a0]">
            {t("pgnViewer.emptyState")}
          </div>
        )}

        {headerEntries.length > 0 && (
          <details className="w-[min(100%,50rem)] border-y border-white/7 bg-black/10 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-extrabold text-[#aaa7a0] uppercase marker:text-[#9ac45c]">
              Full PGN data
            </summary>

            <div className="mt-2 grid max-h-56 grid-cols-2 gap-x-4 overflow-y-auto max-[44rem]:grid-cols-1">
              {headerEntries.map(([key, value]) => {
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-white/5 py-2"
                  >
                    <span className="font-extrabold text-[#aaa7a0]">
                      {getKnownHeaderLabel(key)}
                    </span>
                    <span className="min-w-0 overflow-hidden font-bold text-ellipsis whitespace-nowrap text-[#f5f3ed]">
                      {value || "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>

      <aside className="flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-lg border border-[#accc821a] bg-[#22251f] shadow-[0_1rem_2.5rem_rgb(0_0_0_/_20%)] max-[72rem]:min-h-0">
        <div className="flex min-h-13 items-center justify-between border-b border-[#accc821a] bg-linear-to-br from-[#1f241f] to-[#20211e] px-4 text-base font-extrabold text-white">
          <span>{t("pgnViewer.pgnAnalysis")}</span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded bg-transparent text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            title={t("pgnViewer.sound")}
            onClick={() => {
              setSoundEnabled(!soundEnabled);
            }}
          >
            {soundEnabled ? (
              <FaVolumeUp aria-hidden="true" />
            ) : (
              <FaVolumeOff aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-white/6 bg-[#242321] p-4">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
            <span>Game source</span>
            <select
              className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
              value={pgnSource}
              onChange={(e) => {
                const nextSource = e.target.value as PgnSource;

                setPgnSource(nextSource);
                setError(null);
                setExternalGames([]);
                setSelectedExternalGameId("");
                setPgnGameInfo(null);

                if (nextSource !== "paste") {
                  setPgnInput("");
                }
              }}
            >
              <option value="lichess">Lichess</option>
              <option value="chesscom">Chess.com</option>
              <option value="paste">Paste PGN</option>
            </select>
          </label>

          {pgnSource === "paste" ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <label className="text-base font-black text-white">
                  {t("pgnViewer.pastePgn")}
                </label>

                <button
                  type="button"
                  className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-white/8 bg-[#36342f] px-3 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
                  onClick={handlePaste}
                >
                  <FaClipboard aria-hidden="true" />
                  {t("common.paste")}
                </button>
              </div>

              <textarea
                className="min-h-36 w-full resize-y rounded border border-white/10 bg-[#373530] p-3 font-mono text-sm leading-relaxed text-[#ebe8df] outline-none placeholder:text-[#8f8b84] focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                placeholder={t("pgnViewer.pastePlaceholder")}
                value={pgnInput}
                onChange={(e) => {
                  setPgnInput(e.target.value);
                  setPgnGameInfo(null);
                }}
              />
            </>
          ) : (
            <>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
                <span>Username</span>
                <input
                  className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none placeholder:text-[#8f8b84] focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                  placeholder={
                    pgnSource === "chesscom"
                      ? "ex: hikaru"
                      : "ex: DrNykterstein"
                  }
                  value={externalUsername}
                  onChange={(e) => {
                    setExternalUsername(e.target.value);
                  }}
                />
              </label>

              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/8 bg-[#36342f] px-4 text-sm font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                onClick={handleLoadExternalGames}
                disabled={isLoadingGames || !externalUsername.trim()}
              >
                {isLoadingGames ? "Loading..." : "Load games"}
              </button>

              {externalGames.length > 0 && (
                <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
                  <span>Game</span>
                  <select
                    className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                    value={selectedExternalGameId}
                    onChange={(e) => {
                      const nextGameId = e.target.value;
                      const nextGame = externalGames.find((game) => {
                        return game.id === nextGameId;
                      });

                      setSelectedExternalGameId(nextGameId);
                      setPgnInput(nextGame?.pgn ?? "");
                      setPgnGameInfo(
                        nextGame ? parsePgnGameInfo(nextGame.pgn) : null,
                      );
                    }}
                  >
                    {externalGames.map((game) => {
                      return (
                        <option key={game.id} value={game.id}>
                          {game.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
            </>
          )}

          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-sm font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleLoadPgn}
            disabled={isAnalyzing || !pgnInput.trim()}
          >
            {isAnalyzing ? t("common.analyzing") : t("common.analyze")}
          </button>
        </div>

        <div className="border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            {t("common.appearance")}
          </h2>

          <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
            <span>{t("common.pieceSet")}</span>
            <select
              className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
              value={pieceSet}
              onChange={(e) => {
                setPieceSet(e.target.value as PieceSet);
              }}
            >
              {PIECE_SETS.map((set) => {
                return (
                  <option key={set.value} value={set.value}>
                    {set.label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        {currentAnalysisPosition && currentAnalysisLines.length > 0 && (
          <div className="border-b border-white/6 p-4">
            <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
              {t("pgnViewer.engineLines")}
            </h2>

            <div className="flex flex-col gap-2">
              {currentAnalysisLines.map((line) => {
                const sanMoves = getSanLine(
                  currentAnalysisPosition.fen,
                  line.pv,
                );

                return (
                  <div
                    key={line.multiPv}
                    className="grid min-h-9 grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-white/6 bg-[#302e2a] px-2.5 py-2 text-sm"
                  >
                    <span className="rounded bg-black px-2 py-1 text-center font-mono text-xs font-black text-white">
                      {getFormattedScore(line.score, line.mate)}
                    </span>

                    <span className="min-w-0 overflow-hidden font-bold text-ellipsis whitespace-nowrap text-[#ebe8df]">
                      {sanMoves.length > 0
                        ? sanMoves.join(", ")
                        : t("pgnViewer.noLine")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="px-4 pb-4">
            <div className="h-2 overflow-hidden rounded-full bg-[#171614]">
              <div
                className="h-full bg-[#86a94f] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-extrabold text-[#aaa7a0]">
              {Math.round(progress)}%
            </p>
          </div>
        )}

        {moves.length > 0 && !isAnalyzing && (
          <>
            <div className="min-h-48 flex-1 overflow-hidden border-b border-white/6 p-4">
              <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
                {t("common.moves")}
              </h2>

              <MoveList
                moves={moves}
                currentMoveIndex={moves.length - 1}
                onGoToMove={(idx) => {
                  if (positions.length > 0 && idx < currentIdx) {
                    goToPosition(idx + 1);
                    return;
                  }

                  const practiceIndex = idx - Math.max(0, currentIdx);

                  if (
                    practiceIndex >= 0 &&
                    practiceIndex < practiceMoves.length
                  ) {
                    goToPracticeCursor(practiceIndex + 1);
                  }
                }}
                showEvaluation={showMoveEvaluation}
              />
            </div>

            <div className="border-b border-white/6 p-4">
              <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
                {t("common.accuracy")}
              </h2>

              <div className="grid grid-cols-2 gap-3 max-[44rem]:grid-cols-1">
                <div className="min-h-18 rounded-md border border-white/6 bg-[#302e2a] p-3">
                  <div className="text-xs font-extrabold text-[#aaa7a0] uppercase">
                    {t("common.white")}
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {computeAccuracy(moves, "w")}%
                  </div>
                </div>

                <div className="min-h-18 rounded-md border border-white/6 bg-[#302e2a] p-3">
                  <div className="text-xs font-extrabold text-[#aaa7a0] uppercase">
                    {t("common.black")}
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {computeAccuracy(moves, "b")}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
