/**
 * 앱 라우트 트리.
 *
 * ViewportShell이 전체 화면 비율/공통 레이아웃을 잡고,
 * ProtectedRoute 아래에는 로그인 세션이 필요한 페이지를 둡니다.
 */
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
import AccountPage from "@/domains/user/pages/AccountPage";
import SettingPage from "@/domains/settings/pages/SettingPage";

import StorePage from "@/domains/store/pages/StorePage";

export const router = createBrowserRouter([
  {
    element: <ViewportShell />,
    children: [
      // 공개 라우트: 로그인 전에도 접근 가능
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      {
        // 보호 라우트: authStore에 로그인 사용자 정보가 있어야 접근 가능
        element: <ProtectedRoute />,
        children: [
          { path: "/lobby", element: <LobbyPage /> },
          { path: "/roomInvite", element: <RoomInvitePage /> },
          { path: "/gameMode", element: <GameModePage /> },
          { path: "/multiplay", element: <MultiplayEntryPage /> },
          { path: "/game-setup", element: <GameSetupPage /> },
          { path: "/game-matching", element: <GameMatchingPage /> },
          { path: "/mypage", element: <MyPage /> },
          { path: "/account", element: <AccountPage /> },
          { path: "/setting", element: <SettingPage /> },
          { path: "/store", element: <StorePage /> },
        ],
      },
    ],
  },
]);
