import { type ReactNode, useState } from "react";
import {
  FaChartLine,
  FaChessPawn,
  FaCircle,
  FaGithub,
  FaHistory,
  FaPlay,
  FaTrash,
  FaUser,
  FaUserPlus,
} from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "react-toastify";

import { useHealthCheck } from "../hooks/useHealthCheck";
import { useUserStore } from "../store/userStore";
import ConfirmModal from "./ConfirmModal";
import CreateUserModal from "./CreateUserModal";

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const healthStatus = useHealthCheck();
  const users = useUserStore((s) => s.users);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const createUser = useUserStore((s) => s.createUser);
  const deleteUser = useUserStore((s) => s.deleteUser);
  const setActiveUser = useUserStore((s) => s.setActiveUser);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);

  function handleCreateUser(name: string) {
    createUser(name);
    toast.success(`User "${name}" created`);
  }

  function getNavButtonClass(path: string) {
    let className =
      "flex min-h-11 w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 text-left text-[0.95rem] font-bold whitespace-nowrap text-[#bebaae] transition-colors hover:bg-[#97c45d1a] hover:text-white";

    if (location.pathname === path) {
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

        <div className="mt-4 border-t border-white/6 pt-3">
          <h2 className="mb-2 px-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            <FaUser
              className="mr-1.5 inline text-[#97c45d]"
              aria-hidden="true"
            />
            Users
          </h2>

          {users.length > 0 && (
            <div className="mx-3 mb-2 flex gap-2">
              <select
                className="mx-3 mb-2 h-9 flex-1 rounded border border-white/10 bg-[#373530] px-2 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                value={activeUserId ?? ""}
                onChange={(e) => {
                  setActiveUser(e.target.value);
                }}
              >
                {users.map((user) => {
                  return (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  );
                })}
              </select>

              {activeUserId && (
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#36342f] text-xs font-extrabold text-[#aaa7a0] transition-colors hover:bg-[#df5353] hover:text-white"
                  title="Delete user"
                  onClick={() => {
                    setShowDeleteUserModal(true);
                  }}
                >
                  <FaTrash aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 px-3">
            <button
              type="button"
              className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-white/8 bg-[#36342f] px-2 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
              onClick={() => {
                setShowCreateModal(true);
              }}
            >
              <FaUserPlus aria-hidden="true" />
              New
            </button>

            {activeUserId && (
              <button
                type="button"
                className={`flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-white/8 bg-[#36342f] px-2 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white ${
                  location.pathname === "/history"
                    ? "bg-[#628d3f] text-white"
                    : ""
                }`}
                onClick={() => {
                  navigate("/history");
                }}
              >
                <FaHistory aria-hidden="true" />
                Games
              </button>
            )}
          </div>
        </div>

        <CreateUserModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
          }}
          onSubmit={handleCreateUser}
        />

        <ConfirmModal
          open={showDeleteUserModal}
          title="Delete user"
          message={
            activeUserId
              ? `Are you sure you want to delete "${
                  users.find((u) => u.id === activeUserId)?.name
                }"? All saved games will be lost.`
              : ""
          }
          onConfirm={() => {
            if (activeUserId) {
              deleteUser(activeUserId);
              toast.success("User deleted");
            }
            setShowDeleteUserModal(false);
          }}
          onCancel={() => {
            setShowDeleteUserModal(false);
          }}
        />

        <div className="mt-4 flex flex-col gap-2 text-sm text-[#aaa7a0]">
          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaCircle
              size={10}
              color={
                healthStatus === "connected"
                  ? "#8ab84f"
                  : healthStatus === "checking"
                    ? "#f2be1f"
                    : "#df5353"
              }
              aria-hidden="true"
            />
            {healthStatus === "connected"
              ? "API Connected"
              : healthStatus === "checking"
                ? "Checking API..."
                : "API Disconnected"}
          </div>

          <Link
            to="https://github.com/gabriel-logan/stockfish"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2 transition-colors hover:bg-white/10"
          >
            <FaGithub className="text-[#97c45d]" aria-hidden="true" />
            <strong>GitHub</strong>
          </Link>

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

            <button
              type="button"
              className={`${getNavButtonClass("/history")} min-h-9 w-auto max-[44rem]:flex-1 max-[44rem]:justify-center`}
              onClick={() => {
                navigate("/history");
              }}
            >
              <FaHistory
                className="text-xl text-[#a9d86f]"
                aria-hidden="true"
              />
              Games
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
