import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaUserPlus } from "react-icons/fa";
import { Link, useNavigate } from "react-router";
import { toast } from "react-toastify";

import { getApiErrorMessage } from "../lib/apiInstance";
import { useRegisterMutation } from "../mutations/authMutations";

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: register, isPending: submitting } = useRegisterMutation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    register(
      { username, email, password },
      {
        onSuccess: () => {
          navigate("/online", { replace: true });
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error));
        },
      },
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] w-full items-center justify-center">
      <form
        className="grid w-full max-w-md gap-4 rounded-md border border-white/8 bg-[#20241f] p-6 shadow-2xl shadow-black/25"
        onSubmit={handleSubmit}
      >
        <div className="mb-2 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded bg-[#628d3f] text-xl text-white">
            <FaUserPlus aria-hidden="true" />
          </span>

          <div>
            <h1 className="text-2xl font-extrabold text-[#f3f1e9]">
              {t("auth.registerTitle")}
            </h1>
            <p className="text-sm font-bold text-[#aaa7a0]">
              {t("auth.registerSubtitle")}
            </p>
          </div>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-[#d9d5ca]">
          {t("common.username")}
          <input
            className="h-11 rounded border border-white/10 bg-[#373530] px-3 text-[#f3f1e9] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
            type="text"
            value={username}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-[#d9d5ca]">
          {t("common.email")}
          <input
            className="h-11 rounded border border-white/10 bg-[#373530] px-3 text-[#f3f1e9] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-[#d9d5ca]">
          {t("common.password")}
          <input
            className="h-11 rounded border border-white/10 bg-[#373530] px-3 text-[#f3f1e9] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={8}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>

        <button
          type="submit"
          className="min-h-11 rounded bg-[#628d3f] px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#7aad4e] disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>

        <p className="text-center text-sm font-bold text-[#aaa7a0]">
          {t("auth.hasAccount")}{" "}
          <Link className="text-[#a9d86f] hover:text-white" to="/login">
            {t("common.login")}
          </Link>
        </p>
      </form>
    </div>
  );
}
