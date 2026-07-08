import { type ReactNode } from "react";
import { FaChartLine, FaChessPawn, FaCircle, FaPlay } from "react-icons/fa";

interface Props {
  children: ReactNode;
  currentRoute: string;
  navigate: (path: string) => void;
}

export default function Layout({ children, currentRoute, navigate }: Props) {
  function getNavButtonClass(path: string) {
    let className =
      "flex min-h-11 w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 text-left text-[0.95rem] font-bold whitespace-nowrap text-[#bebaae] transition-colors hover:bg-[#97c45d1a] hover:text-white";

    if (currentRoute === path) {
      className = `${className} bg-linear-to-br from-[#628d3f] to-[#3f735c] text-[#f9fff0] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_9%)]`;
    }

    return className;
  }

  return (
    <div className="grid min-h-screen grid-cols-[12rem_minmax(0,1fr)] bg-[#292b28] max-[72rem]:grid-cols-1">
      <aside className="sticky top-0 flex min-h-screen flex-col border-r border-[#9dc4701a] bg-[#20241f] p-4 max-[72rem]:hidden">
        <div className="mb-5 flex min-h-10 items-center gap-2 text-[1.18rem] font-extrabold text-[#f3f1e9]">
          <FaChessPawn
            className="text-[1.7rem] leading-none text-[#97c45d]"
            aria-hidden="true"
          />
          <span>Stockfish Lab</span>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Primary">
          <button
            type="button"
            className={getNavButtonClass("/play")}
            onClick={() => {
              navigate("/play");
            }}
          >
            <FaPlay className="text-xl text-[#a9d86f]" aria-hidden="true" />
            Versus Engine
          </button>

          <button
            type="button"
            className={getNavButtonClass("/pgn")}
            onClick={() => {
              navigate("/pgn");
            }}
          >
            <FaChartLine
              className="text-xl text-[#a9d86f]"
              aria-hidden="true"
            />
            Analyze PGN
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-2 text-sm text-[#aaa7a0]">
          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaCircle size={10} color="#8ab84f" aria-hidden="true" />
            Local engine
          </div>

          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <span className="grid size-6 place-items-center rounded bg-[#5f8d3d] text-xs font-extrabold text-white">
              GL
            </span>
            <strong>Gabriel-Logan</strong>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 hidden min-h-14 items-center justify-between gap-3 border-b border-white/7 bg-[#242321] px-3 max-[72rem]:flex max-[44rem]:flex-col max-[44rem]:items-stretch max-[44rem]:p-3">
          <div className="flex min-h-10 items-center gap-2 text-[1.18rem] font-extrabold text-[#f3f1e9]">
            <FaChessPawn
              className="text-[1.7rem] leading-none text-[#97c45d]"
              aria-hidden="true"
            />
            <span>Stockfish Lab</span>
          </div>

          <nav
            className="flex gap-2 max-[44rem]:w-full"
            aria-label="Primary mobile"
          >
            <button
              type="button"
              className={`${getNavButtonClass("/play")} min-h-9 w-auto max-[44rem]:flex-1 max-[44rem]:justify-center`}
              onClick={() => {
                navigate("/play");
              }}
            >
              <FaPlay className="text-xl text-[#a9d86f]" aria-hidden="true" />
              Play
            </button>

            <button
              type="button"
              className={`${getNavButtonClass("/pgn")} min-h-9 w-auto max-[44rem]:flex-1 max-[44rem]:justify-center`}
              onClick={() => {
                navigate("/pgn");
              }}
            >
              <FaChartLine
                className="text-xl text-[#a9d86f]"
                aria-hidden="true"
              />
              PGN
            </button>
          </nav>
        </header>

        <main className="flex min-h-screen w-full items-start justify-center p-4 max-[44rem]:p-3">
          {children}
        </main>
      </div>
    </div>
  );
}
