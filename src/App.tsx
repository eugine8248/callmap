import { Routes, Route } from "react-router-dom";
import HomePage from "./routes/HomePage";
import GraphPage from "./routes/GraphPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/graph" element={<GraphPage />} />
    </Routes>
  );
}
