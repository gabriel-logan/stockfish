export interface PgnMoveInfo {
  comment?: string;
  clock?: string;
  elapsed?: string;
}

export interface PgnGameInfo {
  headers: Record<string, string>;
  moveInfo: PgnMoveInfo[];
}

export function getMoveUci(move: {
  from: string;
  to: string;
  promotion?: string;
}): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function formatPgnDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

export function getPgnHeader(pgn: string, header: string): string {
  const match = pgn.match(new RegExp(`\\[${header}\\s+"([^"]*)"\\]`));

  return match?.[1] ?? "";
}

export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /^\[([A-Za-z0-9_]+)\s+"((?:\\"|[^"])*)"\]$/gm;
  let match = headerRegex.exec(pgn);

  while (match) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
    match = headerRegex.exec(pgn);
  }

  return headers;
}

function stripPgnVariations(movetext: string): string {
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

function cleanMoveComment(comment: string): string {
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

export function parsePgnGameInfo(pgn: string): PgnGameInfo {
  return {
    headers: parsePgnHeaders(pgn),
    moveInfo: parsePgnMoveInfo(pgn),
  };
}

export function splitPgnList(pgnText: string): string[] {
  return pgnText
    .split(/\n\s*\n(?=\[Event\s+")/g)
    .map((pgn) => {
      return pgn.trim();
    })
    .filter(Boolean);
}

export function formatExternalGameLabel(pgn: string, fallback: string): string {
  const white = getPgnHeader(pgn, "White") || "White";
  const black = getPgnHeader(pgn, "Black") || "Black";
  const result = getPgnHeader(pgn, "Result") || "*";
  const date = getPgnHeader(pgn, "Date");

  if (date) {
    return `${date} - ${white} vs ${black} ${result}`;
  }

  return `${fallback} - ${white} vs ${black} ${result}`;
}
