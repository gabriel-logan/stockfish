import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { Bounce, ToastContainer } from "react-toastify";

import Layout from "./components/Layout";
import { PrivateRoutes, PublicRoutes } from "./components/RouteGuards";
import FreePlay from "./pages/FreePlay";
import GameHistory from "./pages/GameHistory";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import PgnViewer from "./pages/PgnViewer";
import PlayComputer from "./pages/PlayComputer";
import PlayOnline from "./pages/PlayOnline";
import Register from "./pages/Register";

function DocumentMetadata() {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    const pageMetadata: Record<
      string,
      { title: string; description: string; robots: string }
    > = {
      "/": {
        title: t("app.pageTitles.home"),
        description: t("app.pageDescriptions.home"),
        robots: "index, follow",
      },
      "/play": {
        title: t("app.pageTitles.play"),
        description: t("app.pageDescriptions.play"),
        robots: "index, follow",
      },
      "/free-play": {
        title: t("app.pageTitles.freePlay"),
        description: t("app.pageDescriptions.freePlay"),
        robots: "index, follow",
      },
      "/pgn": {
        title: t("app.pageTitles.pgn"),
        description: t("app.pageDescriptions.pgn"),
        robots: "index, follow",
      },
      "/online": {
        title: t("app.pageTitles.online"),
        description: t("app.pageDescriptions.online"),
        robots: "noindex, nofollow",
      },
      "/history": {
        title: t("app.pageTitles.history"),
        description: t("app.pageDescriptions.history"),
        robots: "noindex, nofollow",
      },
      "/login": {
        title: t("app.pageTitles.login"),
        description: t("app.pageDescriptions.login"),
        robots: "noindex, nofollow",
      },
      "/register": {
        title: t("app.pageTitles.register"),
        description: t("app.pageDescriptions.register"),
        robots: "noindex, nofollow",
      },
    };

    const metadata = pageMetadata[location.pathname] ?? {
      title: t("app.title"),
      description: t("app.pageDescriptions.notFound"),
      robots: "noindex, nofollow",
    };

    document.title = metadata.title;

    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", metadata.description);
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute("content", metadata.robots);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", metadata.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", metadata.description);
    document
      .querySelector('meta[name="twitter:title"]')
      ?.setAttribute("content", metadata.title);
    document
      .querySelector('meta[name="twitter:description"]')
      ?.setAttribute("content", metadata.description);
  }, [location.pathname, t]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <DocumentMetadata />

      <Layout>
        <Routes>
          <Route element={<PublicRoutes />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route element={<PrivateRoutes />}>
            <Route path="/online" element={<PlayOnline />} />
          </Route>

          <Route path="/" element={<PlayComputer />} />
          <Route path="/play" element={<PlayComputer />} />
          <Route path="/free-play" element={<FreePlay />} />
          <Route path="/pgn" element={<PgnViewer />} />
          <Route path="/history" element={<GameHistory />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>

      <ToastContainer theme="dark" transition={Bounce} autoClose={1500} />
    </BrowserRouter>
  );
}

export default App;
