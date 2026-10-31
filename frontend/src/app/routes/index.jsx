import { createBrowserRouter, Navigate } from "react-router-dom";
import ViewportShell from "@/shared/layouts/viewportShell";
import LoginPage from "@/domains/auth/pages/LoginPage"
import FindIdPage from "@/domains/auth/pages/FindIdPage"
import { PasswordResetRequestPage, PasswordResetPage } from "@/domains/auth/pages/PasswordResetPage"
import ProtectedRoute from "@/shared/ui/ProtectedRoute";
import MyPage from "@/domains/user/pages/MyPage";
import AccountPage from "@/domains/user/pages/AccountPage";
import EmoticonPalettePage from "@/domains/user/pages/EmoticonPalettePage";
import LobbyPage from "@/domains/lobby/pages/LobbyPage";
import GameModePage from "@/domains/game/mode/pages/GameModePage";
import MultiplayEntryPage from "@/domains/game/mode/pages/MultiplayEntryPage";
import RoomInvitePage from "@/domains/game/mode/pages/RoomInvitePage";
import GameSetupPage from "@/domains/game/setup/pages/GameSetupPage";
import GameMatchingPage from "@/domains/game/matching/pages/GameMatchingPage";
import InGamePage from "@/domains/game/ingame/pages/InGamePage.jsx";
import GameResultPage from "@/domains/game/result/page/GameResultPage";
import TribunalPresentationPreviewPage from "@/domains/game/ingame/pages/TribunalPresentationPreviewPage.jsx";
import SettingPage from "@/domains/settings/pages/SettingPage.jsx";
import StorePage from "@/domains/store/pages/StorePage.jsx";
import LibraryPage from "@/domains/library/pages/LibraryPage.jsx";
export const router = createBrowserRouter([
    {
    element: <ViewportShell />,
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
          ...(import.meta.env.DEV
            ? [{ path: "/dev/tribunal-presentation", element: <TribunalPresentationPreviewPage /> }]
            : []),
          { path: "/setting", element: <SettingPage /> },
          { path: "/store", element: <StorePage /> },
          { path: "/library", element: <LibraryPage /> },
          { path: "/podium", element: <Navigate to="/lobby" replace /> },
        ],
      },
    ],
  },
])