import { useState } from "react";
import { FaTimes } from "react-icons/fa";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export default function CreateUserModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");

  if (!open) {
    return null;
  }

  function handleSubmit() {
    const trimmed = name.trim();

    if (trimmed) {
      onSubmit(trimmed);
      setName("");
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-[min(100%,22rem)] rounded-lg border border-white/10 bg-[#242321] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#f4f1e8]">New User</h2>

          <button
            type="button"
            className="grid size-8 place-items-center rounded text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            onClick={onClose}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <input
          className="mb-5 h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none placeholder:text-[#8f8b84] focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
          placeholder="Enter a name..."
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          autoFocus
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center rounded border border-white/8 bg-[#36342f] px-4 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center rounded border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-xs font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
