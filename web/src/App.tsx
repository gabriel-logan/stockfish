import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { Bounce, ToastContainer } from "react-toastify";

import Layout from "./components/Layout";
import GameHistory from "./pages/GameHistory";
import NotFound from "./pages/NotFound";
import PgnViewer from "./pages/PgnViewer";
import PlayComputer from "./pages/PlayComputer";

const pageTitles: Record<string, string> = {
  "/": "GLFish - Play Stockfish and analyze your games",
  "/play": "Play Stockfish - GLFish",
  "/pgn": "Analyze PGN - GLFish",
  "/history": "Saved Games - GLFish",
};

function DocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    document.title = pageTitles[location.pathname] ?? "GLFish";
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <DocumentTitle />

      <Layout>
        <Routes>
          <Route path="/" element={<PlayComputer />} />
          <Route path="/play" element={<PlayComputer />} />
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
