import { BrowserRouter, Route, Routes } from "react-router-dom"
import GameModePage from "./pages/GameModePage.jsx"
import HomePage from "./pages/HomePage.jsx"
import RoomInvitePage from "./pages/RoomInvitePage.jsx"
import SettingPage from "./pages/SettingPage.jsx"
import LobbyPage from "./pages/LobbyPage.jsx"
import LoginPage from "./pages/LoginPage.jsx"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/gameMode" element={<GameModePage />} />
        <Route path="/roomInvite" element={<RoomInvitePage />} />
        <Route path="/setting" element={<SettingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
