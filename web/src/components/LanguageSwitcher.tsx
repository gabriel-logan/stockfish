import { useUserStore } from "../store/userStore";

const LOCALES = [
  { value: "en", label: "EN" },
  { value: "pt", label: "PT" },
] as const;

const activeClass =
  "bg-linear-to-br from-[#628d3f] to-[#3f735c] text-[#f9fff0] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_9%)]";
const inactiveClass =
  "bg-[#36342f] text-[#bebaae] hover:bg-[#48453e] hover:text-white";

export default function LanguageSwitcher() {
  const locale = useUserStore((s) => s.locale);

  const setLocale = useUserStore((s) => s.setLocale);

  return (
    <div className="flex overflow-hidden rounded-md border border-white/8">
      {LOCALES.map((lang) => {
        const isActive = locale === lang.value;

        return (
          <button
            key={lang.value}
            type="button"
            className={`min-w-12 flex-1 px-2 py-1.5 text-center text-xs font-extrabold tracking-wide transition-colors ${isActive ? activeClass : inactiveClass}`}
            onClick={() => {
              setLocale(lang.value);
            }}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
