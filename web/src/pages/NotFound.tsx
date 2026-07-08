import { useTranslation } from "react-i18next";
import { FaChessPawn } from "react-icons/fa";
import { Link } from "react-router";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-6 text-center">
      <FaChessPawn className="text-6xl text-[#97c45d]" />

      <h1 className="text-4xl font-extrabold text-[#f3f1e9]">
        {t("notFound.title")}
      </h1>

      <p className="max-w-sm text-lg text-[#bebaae]">{t("notFound.message")}</p>

      <Link
        to="/play"
        className="rounded-md bg-[#628d3f] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#7aad4e]"
      >
        {t("notFound.backToGame")}
      </Link>
    </div>
  );
}
