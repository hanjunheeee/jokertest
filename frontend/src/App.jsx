import { BrowserRouter, Route, Routes } from "react-router-dom"
import HomePage from "./pages/HomePage.jsx"
import LobbyPage from "./pages/LobbyPage.jsx"
import LoginPage from "./pages/LoginPage.jsx"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
      </Routes>
    </BrowserRouter>
  )
}
