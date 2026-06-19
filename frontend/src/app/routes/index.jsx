import { createBrowserRouter } from "react-router-dom";

import ViewportShell from "@/app/layouts/ViewportShell.jsx";
import ProtectedRoute from "@/shared/ui/ProtectedRoute";

import HomePage from "@/pages/HomePage"

import LoginPage from "@/domains/auth/pages/LoginPage";

import LobbyPage from "@/domains/lobby/pages/LobbyPage";

import GameModePage from "@/domains/game/mode/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/mode/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/mode/pages/RoomInvitePage";

import GameSetupPage from "@/domains/game/setup/pages/GameSetupPage";
import GameMatchingPage from "@/domains/game/matching/pages/GameMatchingPage";

import MyPage from "@/domains/user/pages/MyPage";
import SettingPage from "@/domains/settings/pages/SettingPage";

import StorePage from "@/domains/store/pages/StorePage";



export const router = createBrowserRouter([
  {
    element: <ViewportShell />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/lobby", element: <LobbyPage /> },
          { path: "/roomInvite", element: <RoomInvitePage /> },
          { path: "/gameMode", element: <GameModePage /> },
          { path: "/multiplay", element: <MultiplayEntryPage /> },
          { path: "/game-setup", element: <GameSetupPage /> },
          { path: "/game-matching", element: <GameMatchingPage /> },
          { path: "/mypage", element: <MyPage /> },
          { path: "/setting", element: <SettingPage /> },
          { path: "/store", element: <StorePage /> },
        ],
      },
    ],
  },
]);
