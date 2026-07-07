import { useEffect, useState } from "react";

import Layout from "./components/Layout";
import PgnViewer from "./pages/PgnViewer";
import PlayComputer from "./pages/PlayComputer";

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.hash.slice(1) || "/play";
  });

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash.slice(1) || "/play");
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  return (
    <Layout navigate={navigate} currentRoute={route}>
      {route === "/play" && <PlayComputer />}
      {route === "/pgn" && <PgnViewer />}
    </Layout>
  );
}

export default App;
