/**
 * 앱 라우트 트리.
 *
 * ViewportShell이 전체 화면 비율/공통 레이아웃을 잡고,
 * ProtectedRoute 아래에는 로그인 세션이 필요한 페이지를 둡니다.
 */
// React Router는 "주소(URL)에 따라 어떤 컴포넌트를 보여줄지" 연결해주는 라이브러리입니다.
// createBrowserRouter는 <Routes>/<Route>를 JSX로 나열하는 대신, 아래처럼 자바스크립트
// 객체 배열로 라우트 트리를 정의하는 방식입니다. 각 항목의 path가 주소, element가
// 그 주소에서 보여줄 컴포넌트, children이 중첩된 하위 라우트를 뜻합니다.
import { createBrowserRouter } from "react-router-dom";

import ViewportShell from "@/app/layouts/ViewportShell.jsx";
import ProtectedRoute from "@/shared/ui/ProtectedRoute";

import LoginPage from "@/domains/auth/pages/LoginPage";

import LobbyPage from "@/domains/lobby/pages/LobbyPage";

import GameModePage from "@/domains/game/mode/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/mode/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/mode/pages/RoomInvitePage";

import GameSetupPage from "@/domains/game/setup/pages/GameSetupPage";
import GameMatchingPage from "@/domains/game/matching/pages/GameMatchingPage";
import InGamePage from "@/domains/game/ingame/pages/InGamePage.jsx";

import MyPage from "@/domains/user/pages/MyPage";
import AccountPage from "@/domains/user/pages/AccountPage";
import SettingPage from "@/domains/settings/pages/SettingPage";

import StorePage from "@/domains/store/pages/StorePage";

export const router = createBrowserRouter([
  {
    // 최상위 element는 모든 라우트를 감싸는 공통 레이아웃(ViewportShell).
    // ViewportShell 내부의 <Outlet />에 아래 children 중 주소가 일치하는 페이지가 렌더됩니다.
    element: <ViewportShell />,
    children: [
      // 공개 라우트: 로그인 전에도 접근 가능
      { path: "/", element: <LoginPage /> },
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
          { path: "/ingame", element: <InGamePage /> },
          { path: "/mypage", element: <MyPage /> },
          { path: "/account", element: <AccountPage /> },
          { path: "/setting", element: <SettingPage /> },
          { path: "/store", element: <StorePage /> },
        ],
      },
    ],
  },
]);
