import { useTranslation } from "react-i18next";
import { FaCheck, FaHandshake, FaTimes } from "react-icons/fa";

interface Props {
  open: boolean;
  opponentName: string;
  actionDisabled?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function DrawOfferModal({
  open,
  opponentName,
  actionDisabled = false,
  onAccept,
  onDecline,
}: Props) {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDecline();
        }
      }}
    >
      <div
        className="w-[min(100%,25rem)] rounded-lg border border-white/10 bg-[#242321] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-offer-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <FaHandshake
              className="text-xl text-[#b7d58a]"
              aria-hidden="true"
            />
            <h2
              id="draw-offer-title"
              className="text-lg font-extrabold text-[#f4f1e8]"
            >
              {t("online.drawOffer.title")}
            </h2>
          </div>

          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            onClick={onDecline}
            aria-label={t("online.drawOffer.decline")}
            disabled={actionDisabled}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-[#c9d0bd]">
          {t("online.drawOffer.message", { opponent: opponentName })}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/8 bg-[#36342f] px-4 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white disabled:opacity-60"
            onClick={onDecline}
            disabled={actionDisabled}
          >
            <FaTimes aria-hidden="true" />
            {t("online.drawOffer.decline")}
          </button>

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-[#628d3f] px-4 text-xs font-extrabold text-white transition-colors hover:bg-[#7aad4e] disabled:opacity-60"
            onClick={onAccept}
            disabled={actionDisabled}
          >
            <FaCheck aria-hidden="true" />
            {t("online.drawOffer.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
