// 데스크톱 라우터: 경로 전부 (모바일 app/routes/index.jsx와 같은 경로)
// 가끔 여는 화면은 열 때 받음 → 첫 화면 JS 줄임 (DP-025)
import { createBrowserRouter, Navigate } from "react-router-dom";
import ViewportShell from "@/shared/layouts/viewportShell";
import LoginPage from "@/domains/auth/pages/LoginPage"
import FindIdPage from "@/domains/auth/pages/FindIdPage"
import { PasswordResetRequestPage, PasswordResetPage } from "@/domains/auth/pages/PasswordResetPage"
import ProtectedRoute from "@/shared/ui/ProtectedRoute";
import LobbyPage from "@/domains/lobby/pages/LobbyPage";
import GameModePage from "@/domains/game/mode/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/mode/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/mode/pages/RoomInvitePage";
import GameSetupPage from "@/domains/game/setup/pages/GameSetupPage";
import GameMatchingPage from "@/domains/game/matching/pages/GameMatchingPage";
import InGamePage from "@/domains/game/ingame/pages/InGamePage.jsx";
import GameResultPage from "@/domains/game/result/page/GameResultPage";
import RouteErrorScreen from "@/app/RouteErrorScreen.jsx";

// 로그인 쪽(아이디 찾기·비번 재설정 포함)·게임 흐름(로비·모드·대기방·인게임·결과)은 바로 싣기
// 판 도중 화면 바뀔 때 받는 시간이 끼지 않게 하기 위함
function page(load) {
    return async () => ({ Component: (await load()).default })
}

export const router = createBrowserRouter([
    {
    element: <ViewportShell />,
    // 화면 하나가 터져도 돌아갈 버튼이 있는 오류 화면 (FE-013)
    errorElement: <RouteErrorScreen />,
    // 나중 받는 화면을 새로 읽기 직후 처음 열 때 받는 동안 빈 검은 화면 (모바일과 같음)
    hydrateFallbackElement: <div className="h-svh w-full bg-black" />,
    children: [
      { path: "/", element: <LoginPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/find-id", element: <FindIdPage /> },
      { path: "/password-reset/request", element: <PasswordResetRequestPage /> },
      { path: "/password-reset", element: <PasswordResetPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/mypage", lazy: page(() => import("@/domains/user/pages/MyPage")) },
          { path: "/mypage/emoticons", lazy: page(() => import("@/domains/user/pages/EmoticonPalettePage")) },
          { path: "/account", lazy: page(() => import("@/domains/user/pages/AccountPage")) },
          { path: "/lobby", element: <LobbyPage /> },
          { path: "/gameMode", element: <GameModePage /> },
          { path: "/multiplay", element: <MultiplayEntryPage /> },
          { path: "/roomInvite", element: <RoomInvitePage /> },
          { path: "/game-setup", element: <GameSetupPage /> },
          { path: "/game-matching", element: <GameMatchingPage /> },
          { path: "/ingame", element: <InGamePage /> },
          { path: "/gameresult", element: <GameResultPage /> },
          ...(import.meta.env?.DEV
            ? [{ path: "/dev/tribunal-presentation", lazy: page(() => import("@/domains/game/ingame/pages/TribunalPresentationPreviewPage.jsx")) }]
            : []),
          { path: "/setting", lazy: page(() => import("@/domains/settings/pages/SettingPage.jsx")) },
          { path: "/store", lazy: page(() => import("@/domains/store/pages/StorePage.jsx")) },
          { path: "/library", lazy: page(() => import("@/domains/library/pages/LibraryPage.jsx")) },
          { path: "/podium", element: <Navigate to="/lobby" replace /> },
        ],
      },
      // 없는 주소 (FE-013)
      { path: "*", element: <RouteErrorScreen notFound /> },
    ],
  },
])
