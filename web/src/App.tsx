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

function DocumentTitle() {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    const pageTitles: Record<string, string> = {
      "/": t("app.pageTitles.home"),
      "/play": t("app.pageTitles.play"),
      "/online": t("app.pageTitles.online"),
      "/free-play": t("app.pageTitles.freePlay"),
      "/pgn": t("app.pageTitles.pgn"),
      "/history": t("app.pageTitles.history"),
      "/login": t("app.pageTitles.login"),
      "/register": t("app.pageTitles.register"),
    };

    document.title = pageTitles[location.pathname] ?? t("app.title");
  }, [location.pathname, t]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <DocumentTitle />

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
