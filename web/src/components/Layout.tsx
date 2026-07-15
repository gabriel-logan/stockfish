import { Fragment, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaBars,
  FaChartLine,
  FaChessPawn,
  FaCircle,
  FaGithub,
  FaGlobe,
  FaHistory,
  FaPlay,
  FaSignInAlt,
  FaSignOutAlt,
  FaTimes,
  FaTrash,
  FaUser,
  FaUserPlus,
  FaUsers,
} from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "react-toastify";

import { useApiHealthCheck } from "../hooks/useApiHealth";
import { useEngineHealthCheck } from "../hooks/useEngineHealth";
import { getApiErrorMessage } from "../lib/apiInstance";
import { logoutUser } from "../services/authService";
import { useAuthStore } from "../store/authStore";
import { useUserStore } from "../store/userStore";
import ConfirmModal from "./ConfirmModal";
import CreateUserModal from "./CreateUserModal";
import LanguageSwitcher from "./LanguageSwitcher";

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const engineHealthStatus = useEngineHealthCheck();
  const apiHealthStatus = useApiHealthCheck();
  const authUser = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const users = useUserStore((s) => s.users);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const activeUser = users.find((u) => u.id === activeUserId);
  const createUser = useUserStore((s) => s.createUser);
  const deleteUser = useUserStore((s) => s.deleteUser);
  const setActiveUser = useUserStore((s) => s.setActiveUser);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  function handleCreateUser(name: string) {
    createUser(name);
    toast.success(t("success.userCreated", { name }));
  }

  async function handleLogout() {
    try {
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      clearSession();
      navigate("/login");
    }
  }

  function getNavButtonClass(path: string) {
    let className =
      "flex min-h-11 w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 text-left text-[0.95rem] font-bold whitespace-nowrap text-[#bebaae] transition-colors hover:bg-[#97c45d1a] hover:text-white";

    if (location.pathname === path) {
      className = `${className} bg-linear-to-br from-[#628d3f] to-[#3f735c] text-[#f9fff0] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_9%)]`;
    }

    return className;
  }

  function renderSidebarContent(closeAfterAction: boolean) {
    function navigateFromSidebar(path: string) {
      navigate(path);

      if (closeAfterAction) {
        closeDrawer();
      }
    }

    function logoutFromSidebar() {
      void handleLogout();

      if (closeAfterAction) {
        closeDrawer();
      }
    }

    return (
      <>
        <nav className="flex flex-col gap-1" aria-label={t("nav.primary")}>
          <button
            type="button"
            className={getNavButtonClass("/play")}
            onClick={() => {
              navigateFromSidebar("/play");
            }}
          >
            <FaPlay className="text-xl text-[#a9d86f]" aria-hidden="true" />
            {t("common.versusEngine")}
          </button>

          <button
            type="button"
            className={getNavButtonClass("/online")}
            onClick={() => {
              navigateFromSidebar("/online");
            }}
          >
            <FaUsers className="text-xl text-[#a9d86f]" aria-hidden="true" />
            {t("common.playOnline")}
          </button>

          <button
            type="button"
            className={getNavButtonClass("/pgn")}
            onClick={() => {
              navigateFromSidebar("/pgn");
            }}
          >
            <FaChartLine
              className="text-xl text-[#a9d86f]"
              aria-hidden="true"
            />
            {t("common.analyzePgn")}
          </button>

          <button
            type="button"
            className={getNavButtonClass("/free-play")}
            onClick={() => {
              navigateFromSidebar("/free-play");
            }}
          >
            <FaUsers className="text-xl text-[#a9d86f]" aria-hidden="true" />
            {t("common.freePlay")}
          </button>
        </nav>

        <div className="mt-4 border-t border-white/6 pt-4">
          {authUser ? (
            <div className="rounded-md border border-white/8 bg-[#292d27] p-2">
              <div className="mb-2 flex items-center gap-2 rounded border border-white/6 bg-[#20241f] p-2">
                <span className="grid size-8 shrink-0 place-items-center rounded bg-[#5f8d3d] text-xs font-extrabold text-white">
                  {authUser.username.slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="overflow-hidden text-sm font-extrabold text-ellipsis whitespace-nowrap text-[#f4f1e8]">
                    {authUser.username}
                  </div>
                  <div className="text-[0.7rem] font-bold text-[#aaa7a0]">
                    {t("layout.onlineRating", { rating: authUser.rating })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="flex min-h-9 w-full items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] text-xs font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e] hover:text-white"
                onClick={logoutFromSidebar}
              >
                <FaSignOutAlt aria-hidden="true" />
                {t("common.logout")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded bg-[#628d3f] text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e]"
              onClick={() => {
                navigateFromSidebar("/login");
              }}
            >
              <FaSignInAlt aria-hidden="true" />
              {t("common.login")}
            </button>
          )}
        </div>

        <div className="mt-4 border-t border-white/6 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#b7d58a] uppercase">
              <FaUser className="text-[#97c45d]" aria-hidden="true" />
              {t("layout.userSection")}
            </h2>

            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[0.68rem] font-extrabold text-[#aaa7a0]">
              {users.length}
            </span>
          </div>

          <div className="rounded-md border border-white/8 bg-[#292d27] p-2 shadow-[inset_0_1px_0_rgb(255_255_255_/_4%)]">
            <div className="mb-2 flex items-center gap-2 rounded border border-white/6 bg-[#20241f] p-2">
              <span className="grid size-8 shrink-0 place-items-center rounded bg-[#5f8d3d] text-xs font-extrabold text-white">
                {activeUser ? activeUser.name.slice(0, 2).toUpperCase() : "?"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-sm font-extrabold text-ellipsis whitespace-nowrap text-[#f4f1e8]">
                  {activeUser?.name ?? t("common.noUser")}
                </div>
                <div className="text-[0.7rem] font-bold text-[#aaa7a0]">
                  {activeUser
                    ? t("layout.savedGamesCount", {
                        count: activeUser.games.length,
                      })
                    : t("layout.createUser")}
                </div>
              </div>
            </div>

            {users.length > 0 && (
              <div className="mb-2 flex gap-2">
                <select
                  className="h-9 min-w-0 flex-1 rounded border border-white/10 bg-[#373530] px-2 text-sm font-bold text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
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
                    title={t("layout.deleteUser")}
                    onClick={() => {
                      setShowDeleteUserModal(true);
                    }}
                  >
                    <FaTrash aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="flex min-h-9 items-center justify-center gap-1 rounded border border-white/8 bg-[#3b3934] text-xs font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e] hover:text-white"
                onClick={() => {
                  setShowCreateModal(true);
                }}
              >
                <FaUserPlus aria-hidden="true" />
                {t("common.new")}
              </button>

              {activeUserId && (
                <button
                  type="button"
                  className={`flex min-h-9 items-center justify-center gap-1 rounded border border-white/8 text-xs font-extrabold transition-colors hover:text-white ${
                    location.pathname === "/history"
                      ? "bg-linear-to-br from-[#628d3f] to-[#3f735c] text-white"
                      : "bg-[#3b3934] text-[#f0ece3] hover:bg-[#48453e]"
                  }`}
                  onClick={() => {
                    navigateFromSidebar("/history");
                  }}
                >
                  <FaHistory aria-hidden="true" />
                  {t("common.games")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 text-sm text-[#aaa7a0]">
          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaCircle
              size={10}
              color={
                engineHealthStatus === "connected"
                  ? "#8ab84f"
                  : engineHealthStatus === "checking"
                    ? "#f2be1f"
                    : "#df5353"
              }
              aria-hidden="true"
            />
            {engineHealthStatus === "connected"
              ? t("common.engineConnected")
              : engineHealthStatus === "checking"
                ? t("common.engineChecking")
                : t("common.engineDisconnected")}
          </div>

          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaCircle
              size={10}
              color={
                apiHealthStatus === "connected"
                  ? "#8ab84f"
                  : apiHealthStatus === "checking"
                    ? "#f2be1f"
                    : "#df5353"
              }
              aria-hidden="true"
            />
            {apiHealthStatus === "connected"
              ? t("common.apiConnected")
              : apiHealthStatus === "checking"
                ? t("common.apiChecking")
                : t("common.apiDisconnected")}
          </div>

          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaGlobe className="shrink-0 text-[#97c45d]" aria-hidden="true" />
            <LanguageSwitcher />
          </div>

          <Link
            to="https://github.com/gabriel-logan/stockfish"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2 transition-colors hover:bg-white/10"
          >
            <FaGithub className="text-[#97c45d]" aria-hidden="true" />
            <strong>{t("common.gitHub")}</strong>
          </Link>

          <div className="flex min-h-9 items-center gap-2 rounded-md border border-white/6 bg-white/5 px-2">
            <FaUser className="text-[#97c45d]" aria-hidden="true" />
            <strong>{t("layout.userCount", { count: users.length })}</strong>
          </div>
        </div>
      </>
    );
  }

  return (
    <Fragment>
      <div className="grid min-h-screen grid-cols-[12rem_minmax(0,1fr)] bg-[#292b28] max-[72rem]:grid-cols-1">
        <aside className="sticky top-0 flex min-h-screen flex-col border-r border-[#9dc4701a] bg-[#20241f] p-4 max-[72rem]:hidden">
          <div className="mb-5 flex min-h-10 items-center gap-2 text-[1.18rem] font-extrabold text-[#f3f1e9]">
            <FaChessPawn
              className="text-[1.7rem] leading-none text-[#97c45d]"
              aria-hidden="true"
            />
            <span>{t("app.title")}</span>
          </div>

          {renderSidebarContent(false)}
        </aside>

        {drawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 max-[72rem]:block"
            onClick={closeDrawer}
          />
        )}

        <div
          className={`fixed top-0 left-0 z-50 flex h-full w-48 flex-col border-r border-[#9dc4701a] bg-[#20241f] p-4 shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-5 flex min-h-10 items-center justify-between gap-2 text-[1.18rem] font-extrabold text-[#f3f1e9]">
            <div className="flex items-center gap-2">
              <FaChessPawn
                className="text-[1.7rem] leading-none text-[#97c45d]"
                aria-hidden="true"
              />
              <span>{t("app.title")}</span>
            </div>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded text-[#aaa7a0] hover:text-white"
              onClick={closeDrawer}
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>

          {renderSidebarContent(true)}
        </div>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-white/7 bg-[#242321] px-3 max-[72rem]:flex">
            <button
              type="button"
              className="grid hidden size-10 shrink-0 place-items-center rounded text-[#bebaae] transition-colors hover:bg-white/10 hover:text-white max-[72rem]:grid"
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              <FaBars className="text-xl" aria-hidden="true" />
            </button>
            <div className="flex min-h-10 items-center gap-2 text-[1.18rem] font-extrabold text-[#f3f1e9]">
              <FaChessPawn
                className="text-[1.7rem] leading-none text-[#97c45d]"
                aria-hidden="true"
              />
              <span>{t("app.title")}</span>
            </div>
          </header>

          <main className="flex min-h-screen w-full items-start justify-center p-4 max-[44rem]:p-3">
            {children}
          </main>
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
        title={t("layout.deleteUserTitle")}
        message={
          activeUserId
            ? t("layout.deleteUserMessage", {
                name: users.find((u) => u.id === activeUserId)?.name,
              })
            : ""
        }
        onConfirm={() => {
          if (activeUserId) {
            deleteUser(activeUserId);
            toast.success(t("success.userDeleted"));
          }
          setShowDeleteUserModal(false);
        }}
        onCancel={() => {
          setShowDeleteUserModal(false);
        }}
      />
    </Fragment>
  );
}
