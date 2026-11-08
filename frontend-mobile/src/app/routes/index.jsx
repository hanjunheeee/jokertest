// 모바일 라우터: 데스크톱 app/routes/index.jsx와 같은 경로 전부 (훅 안에 경로 문자열이 박혀 있어서)
// 로그인 필요 경로는 데스크톱 ProtectedRoute(세션 확인·판 소켓 이벤트)를 그대로 부모로 씀
import { createBrowserRouter, Navigate } from "react-router-dom"
import MobileShell from "@m/shared/layouts/MobileShell.jsx"
import ProtectedRoute from "@/shared/ui/ProtectedRoute.jsx"
import RouteErrorPage from "@m/shared/ui/RouteErrorPage.jsx"
import LoginPage from "@m/domains/auth/pages/LoginPage.jsx"
import LobbyPage from "@m/domains/lobby/pages/LobbyPage.jsx"
import GameModePage from "@m/domains/game/mode/pages/GameModePage.jsx"
import MultiplayEntryPage from "@m/domains/game/mode/pages/MultiplayEntryPage.jsx"
import RoomInvitePage from "@m/domains/game/mode/pages/RoomInvitePage.jsx"
import GameSetupPage from "@m/domains/game/setup/pages/GameSetupPage.jsx"
import GameMatchingPage from "@m/domains/game/matching/pages/GameMatchingPage.jsx"
import InGamePage from "@m/domains/game/ingame/pages/InGamePage.jsx"
import GameResultPage from "@m/domains/game/result/pages/GameResultPage.jsx"

// 게임 흐름(로비·모드·대기방·인게임·결과)은 바로 싣고, 가끔 여는 화면만 열 때 받음 → 첫 화면 JS 줄임
// 판 도중 화면 바뀔 때 받는 시간이 끼지 않게 게임 흐름은 나누지 않음
function page(load) {
    return async () => ({ Component: (await load()).default })
}

export const router = createBrowserRouter([
    {
        element: <MobileShell />,
        errorElement: <RouteErrorPage />,
        // 나중 받는 화면을 처음 열 때(새로 읽기 직후) 받는 동안 빈 검은 화면
        hydrateFallbackElement: <div className="h-svh bg-black" />,
        children: [
            { path: "/", element: <LoginPage /> },
            { path: "/login", element: <LoginPage /> },
            { path: "/find-id", lazy: page(() => import("@m/domains/auth/pages/FindIdPage.jsx")) },
            { path: "/password-reset/request", lazy: page(() => import("@m/domains/auth/pages/PasswordResetRequestPage.jsx")) },
            { path: "/password-reset", lazy: page(() => import("@m/domains/auth/pages/PasswordResetPage.jsx")) },
            {
                element: <ProtectedRoute />,
                children: [
                    { path: "/mypage", lazy: page(() => import("@m/domains/user/pages/MyPage.jsx")) },
                    { path: "/mypage/emoticons", lazy: page(() => import("@m/domains/user/pages/EmoticonPalettePage.jsx")) },
                    { path: "/account", lazy: page(() => import("@m/domains/user/pages/AccountPage.jsx")) },
                    { path: "/lobby", element: <LobbyPage /> },
                    { path: "/gameMode", element: <GameModePage /> },
                    { path: "/multiplay", element: <MultiplayEntryPage /> },
                    { path: "/roomInvite", element: <RoomInvitePage /> },
                    { path: "/game-setup", element: <GameSetupPage /> },
                    { path: "/game-matching", element: <GameMatchingPage /> },
                    { path: "/ingame", element: <InGamePage /> },
                    { path: "/gameresult", element: <GameResultPage /> },
                    // 개발 때만 여는 재판 연출 미리보기 (데스크톱과 같음)
                    ...(import.meta.env.DEV
                        ? [{ path: "/dev/tribunal-presentation", lazy: page(() => import("@m/domains/game/ingame/pages/TribunalPresentationPreviewPage.jsx")) }]
                        : []),
                    { path: "/setting", lazy: page(() => import("@m/domains/settings/pages/SettingPage.jsx")) },
                    { path: "/store", lazy: page(() => import("@m/domains/store/pages/StorePage.jsx")) },
                    { path: "/library", lazy: page(() => import("@m/domains/library/pages/LibraryPage.jsx")) },
                    // 명예의 전당은 데스크톱도 로비로 돌려보냄
                    { path: "/podium", element: <Navigate to="/lobby" replace /> },
                ],
            },
            { path: "*", element: <RouteErrorPage /> },
        ],
    },
])
