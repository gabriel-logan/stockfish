import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
  currentRoute: string;
  navigate: (path: string) => void;
}

export default function Layout({ children, currentRoute, navigate }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-6 border-b border-gray-800 px-6 py-3">
        <h1 className="text-lg font-bold text-white">♟ Stockfish</h1>
        <nav className="flex gap-4">
          <button
            type="button"
            className={`rounded px-3 py-1 text-sm transition-colors ${
              currentRoute === "/play"
                ? "bg-blue-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
            onClick={() => {
              navigate("/play");
            }}
          >
            Play Computer
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1 text-sm transition-colors ${
              currentRoute === "/pgn"
                ? "bg-blue-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
            onClick={() => {
              navigate("/pgn");
            }}
          >
            PGN Analysis
          </button>
        </nav>
      </header>
      <main className="flex flex-1 items-start justify-center p-6">
        {children}
      </main>
    </div>
  );
}
