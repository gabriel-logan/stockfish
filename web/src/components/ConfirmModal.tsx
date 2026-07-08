import { useTranslation } from "react-i18next";
import { FaTimes, FaTrash } from "react-icons/fa";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const label = confirmLabel ?? t("modals.confirmLabel");
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="w-[min(100%,22rem)] rounded-lg border border-white/10 bg-[#242321] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#f4f1e8]">{title}</h2>

          <button
            type="button"
            className="grid size-8 place-items-center rounded text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            onClick={onCancel}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-[#c9d0bd]">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center rounded border border-white/8 bg-[#36342f] px-4 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>

          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-red-400/30 bg-[#df5353] px-4 text-xs font-extrabold text-white transition-colors hover:bg-[#e56e6e]"
            onClick={onConfirm}
          >
            <FaTrash aria-hidden="true" />
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
