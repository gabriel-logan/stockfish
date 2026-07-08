import { BrowserRouter, Route, Routes } from "react-router";
import { Bounce, ToastContainer } from "react-toastify";

import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";
import PgnViewer from "./pages/PgnViewer";
import PlayComputer from "./pages/PlayComputer";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PlayComputer />} />
          <Route path="/play" element={<PlayComputer />} />
          <Route path="/pgn" element={<PgnViewer />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>

      <ToastContainer theme="dark" transition={Bounce} />
    </BrowserRouter>
  );
}

export default App;
