// 모바일 라우터: 데스크톱 app/routes/index.jsx와 같은 경로 전부 (훅 안에 경로 문자열이 박혀 있어서)
// 로그인 필요 경로는 데스크톱 ProtectedRoute(세션 확인·판 소켓 이벤트)를 그대로 부모로 씀
import { createBrowserRouter, Navigate } from "react-router-dom"
import MobileShell from "@m/shared/layouts/MobileShell.jsx"
import ProtectedRoute from "@/shared/ui/ProtectedRoute.jsx"
import LoginPage from "@m/domains/auth/pages/LoginPage.jsx"
import FindIdPage from "@m/domains/auth/pages/FindIdPage.jsx"
import PasswordResetRequestPage from "@m/domains/auth/pages/PasswordResetRequestPage.jsx"
import PasswordResetPage from "@m/domains/auth/pages/PasswordResetPage.jsx"
import MyPage from "@m/domains/user/pages/MyPage.jsx"
import AccountPage from "@m/domains/user/pages/AccountPage.jsx"
import EmoticonPalettePage from "@m/domains/user/pages/EmoticonPalettePage.jsx"
import LobbyPage from "@m/domains/lobby/pages/LobbyPage.jsx"
import GameModePage from "@m/domains/game/mode/pages/GameModePage.jsx"
import MultiplayEntryPage from "@m/domains/game/mode/pages/MultiplayEntryPage.jsx"
import RoomInvitePage from "@m/domains/game/mode/pages/RoomInvitePage.jsx"
import GameSetupPage from "@m/domains/game/setup/pages/GameSetupPage.jsx"
import GameMatchingPage from "@m/domains/game/matching/pages/GameMatchingPage.jsx"
import InGamePage from "@m/domains/game/ingame/pages/InGamePage.jsx"
import TribunalPresentationPreviewPage from "@m/domains/game/ingame/pages/TribunalPresentationPreviewPage.jsx"
import GameResultPage from "@m/domains/game/result/pages/GameResultPage.jsx"
import SettingPage from "@m/domains/settings/pages/SettingPage.jsx"
import StorePage from "@m/domains/store/pages/StorePage.jsx"
import LibraryPage from "@m/domains/library/pages/LibraryPage.jsx"

export const router = createBrowserRouter([
    {
        element: <MobileShell />,
        children: [
            { path: "/", element: <LoginPage /> },
            { path: "/login", element: <LoginPage /> },
            { path: "/find-id", element: <FindIdPage /> },
            { path: "/password-reset/request", element: <PasswordResetRequestPage /> },
            { path: "/password-reset", element: <PasswordResetPage /> },
            {
                element: <ProtectedRoute />,
                children: [
                    { path: "/mypage", element: <MyPage /> },
                    { path: "/mypage/emoticons", element: <EmoticonPalettePage /> },
                    { path: "/account", element: <AccountPage /> },
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
                        ? [{ path: "/dev/tribunal-presentation", element: <TribunalPresentationPreviewPage /> }]
                        : []),
                    { path: "/setting", element: <SettingPage /> },
                    { path: "/store", element: <StorePage /> },
                    { path: "/library", element: <LibraryPage /> },
                    // 명예의 전당은 데스크톱도 로비로 돌려보냄
                    { path: "/podium", element: <Navigate to="/lobby" replace /> },
                ],
            },
        ],
    },
])
