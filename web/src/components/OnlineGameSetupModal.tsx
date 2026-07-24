import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaClock, FaTimes } from "react-icons/fa";

import type { MatchmakingOptions } from "../types/api";

interface Props {
  open: boolean;
  confirmDisabled?: boolean;
  initialOptions: MatchmakingOptions;
  onConfirm: (options: MatchmakingOptions) => void;
  onCancel: () => void;
}

const TIME_CONTROLS = [
  { timeControlSeconds: 60, incrementSeconds: 0 },
  { timeControlSeconds: 180, incrementSeconds: 0 },
  { timeControlSeconds: 300, incrementSeconds: 0 },
  { timeControlSeconds: 300, incrementSeconds: 2 },
  { timeControlSeconds: 600, incrementSeconds: 0 },
  { timeControlSeconds: 900, incrementSeconds: 10 },
] as const;

function formatTimeControl(
  timeControlSeconds: number,
  incrementSeconds: number,
) {
  return `${timeControlSeconds / 60}+${incrementSeconds}`;
}

export default function OnlineGameSetupModal({
  open,
  confirmDisabled = false,
  initialOptions,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [options, setOptions] = useState(initialOptions);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="w-[min(100%,28rem)] rounded-lg border border-white/10 bg-[#242321] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-game-setup-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="online-game-setup-title"
              className="text-lg font-extrabold text-[#f4f1e8]"
            >
              {t("online.setup.title")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#aaa7a0]">
              {t("online.setup.description")}
            </p>
          </div>

          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            onClick={onCancel}
            aria-label={t("common.cancel")}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-extrabold text-[#d9d5ca]">
            {t("online.setup.gameType")}
          </legend>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                rated: true,
                label: t("online.setup.rated"),
                description: t("online.setup.ratedDescription"),
              },
              {
                rated: false,
                label: t("online.setup.casual"),
                description: t("online.setup.casualDescription"),
              },
            ].map((gameType) => {
              const selected = options.rated === gameType.rated;

              return (
                <label
                  key={gameType.label}
                  className={`rounded border p-3 transition-colors ${
                    selected
                      ? "border-[#8ab84f] bg-[#628d3f2b]"
                      : "border-white/8 bg-[#302f2b] hover:bg-[#3b3934]"
                  }`}
                >
                  <input
                    type="radio"
                    name="online-game-type"
                    className="sr-only"
                    checked={selected}
                    onChange={() => {
                      setOptions((current) => ({
                        ...current,
                        rated: gameType.rated,
                      }));
                    }}
                  />
                  <span className="block text-sm font-extrabold text-[#f3f1e9]">
                    {gameType.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed font-bold text-[#aaa7a0]">
                    {gameType.description}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mb-6">
          <legend className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#d9d5ca]">
            <FaClock aria-hidden="true" />
            {t("online.setup.timeControl")}
          </legend>

          <div className="grid grid-cols-3 gap-2">
            {TIME_CONTROLS.map((timeControl) => {
              const selected =
                options.timeControlSeconds === timeControl.timeControlSeconds &&
                options.incrementSeconds === timeControl.incrementSeconds;

              return (
                <label
                  key={formatTimeControl(
                    timeControl.timeControlSeconds,
                    timeControl.incrementSeconds,
                  )}
                  className={`rounded border px-2 py-2 text-center transition-colors ${
                    selected
                      ? "border-[#8ab84f] bg-[#628d3f2b] text-white"
                      : "border-white/8 bg-[#302f2b] text-[#d9d5ca] hover:bg-[#3b3934]"
                  }`}
                >
                  <input
                    type="radio"
                    name="online-time-control"
                    className="sr-only"
                    checked={selected}
                    onChange={() => {
                      setOptions((current) => ({
                        ...current,
                        timeControlSeconds: timeControl.timeControlSeconds,
                        incrementSeconds: timeControl.incrementSeconds,
                      }));
                    }}
                  />
                  <span className="text-sm font-extrabold">
                    {formatTimeControl(
                      timeControl.timeControlSeconds,
                      timeControl.incrementSeconds,
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded border border-white/8 bg-[#36342f] px-4 text-sm font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded bg-[#628d3f] px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e] disabled:opacity-60"
            onClick={() => {
              onConfirm(options);
            }}
            disabled={confirmDisabled}
          >
            {t("online.setup.findOpponent")}
          </button>
        </div>
      </div>
    </div>
  );
}
