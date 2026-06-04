import { createBrowserRouter } from "react-router-dom";

import ProtectedRoute from "@/shared/ui/ProtectedRoute";

import HomePage from "@/pages/HomePage"

import LoginPage from "@/domains/auth/pages/LoginPage";

import LobbyPage from "@/domains/lobby/pages/LobbyPage";

import GameModePage from "@/domains/game/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/pages/RoomInvitePage";

import GameSetupPage from "@/domains/game-setup/pages/GameSetupPage";

import MyPage from "@/domains/user/pages/MyPage";
import SettingPage from "@/domains/user/pages/SettingPage";

import StorePage from "@/domains/store/pages/StorePage";



export const router = createBrowserRouter([
    { path: "/", element: <HomePage /> },
    { path: "/login", element: <LoginPage /> },
    {
    element: <ProtectedRoute />, // 👈 path 없이 element만 넣으면 이 그룹의 '레이아웃' 역할을 합니다!
    children: [
      { path: "/lobby", element: <LobbyPage /> },
      { path: "/roomInvite", element: <RoomInvitePage /> },
      { path: "/gameMode", element: <GameModePage /> },
      { path: "/multiplay", element: <MultiplayEntryPage /> },
      { path: "/game-setup", element: <GameSetupPage /> },
      { path: "/mypage", element: <MyPage /> },
      { path: "/setting", element: <SettingPage /> },
      { path: "/store", element: <StorePage /> },
      // 💡 앞으로 추가할 게임 관련 페이지들은 전부 이 children 배열 안에 쏙쏙 넣으시면 됩니다!
    ],
  },
]);