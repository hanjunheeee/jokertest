import { createBrowserRouter, Navigate } from "react-router-dom";
import ViewportShell from "@/shared/layouts/viewportShell";
import LoginPage from "@/domains/auth/pages/LoginPage"
import ProtectedRoute from "@/shared/ui/ProtectedRoute";
import MyPage from "@/domains/user/pages/MyPage";
import AccountPage from "@/domains/user/pages/AccountPage";
import LobbyPage from "@/domains/lobby/pages/LobbyPage";
import GameModePage from "@/domains/game/mode/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/mode/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/mode/pages/RoomInvitePage";
import GameSetupPage from "@/domains/game/setup/pages/GameSetupPage";
import GameMatchingPage from "@/domains/game/matching/pages/GameMatchingPage";
import InGamePage from "@/domains/game/ingame/pages/InGamePage.jsx";
import GameResultPage from "@/domains/game/result/page/GameResultPage";
import SettingPage from "@/domains/settings/pages/SettingPage.jsx";
import StorePage from "@/domains/store/pages/StorePage.jsx";
import LibraryPage from "@/domains/library/pages/LibraryPage.jsx";
// F-18(AC-05/AC-06): 명예의 전당(/podium) 진입은 비활성화합니다. PodiumPage를 더 이상
// import하지 않으므로 어떤 화면도 이 페이지를 그리지 않지만, podium 도메인의 페이지·
// 컴포넌트·이미지 소스는 저장소에 그대로 보존합니다(삭제하지 않습니다).

// 앱 전체 라우터입니다.
// ViewportShell이 공통 화면 폭과 좌우 배너를 담당하고, 로그인 이후 페이지는 ProtectedRoute 아래에 둡니다.
export const router = createBrowserRouter([
    {
    element: <ViewportShell />,
    children: [
      // 로그인은 인증 전에도 접근할 수 있어야 하므로 보호 라우트 밖에 둡니다.
      { path: "/", element: <LoginPage /> },
      { path: "/login", element: <LoginPage /> },
      {
        // 아래 라우트들은 로그인 상태가 아니면 /login으로 이동합니다.
        element: <ProtectedRoute />,
        children: [
          { path: "/mypage", element: <MyPage /> },
          { path: "/account", element: <AccountPage /> },
          { path: "/lobby", element: <LobbyPage /> },
          { path: "/gameMode", element: <GameModePage /> },
          { path: "/multiplay", element: <MultiplayEntryPage /> },
          { path: "/roomInvite", element: <RoomInvitePage /> },
          { path: "/game-setup", element: <GameSetupPage /> },
          { path: "/game-matching", element: <GameMatchingPage /> },
          { path: "/ingame", element: <InGamePage /> },
          { path: "/gameresult", element: <GameResultPage /> },
          { path: "/setting", element: <SettingPage /> },
          { path: "/store", element: <StorePage /> },
          { path: "/library", element: <LibraryPage /> },
          // 보호 경계는 그대로 둡니다 — 로그인하지 않은 사용자는 ProtectedRoute가 먼저
          // /login으로 보내고, 로그인한 사용자만 여기서 /lobby로 되돌아갑니다.
          { path: "/podium", element: <Navigate to="/lobby" replace /> },
        ],
      },
    ],
  },
])