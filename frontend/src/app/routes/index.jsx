import { createBrowserRouter } from "react-router-dom";

import HomePage from "@/pages/HomePage"

import LoginPage from "@/domains/auth/pages/LoginPage";

import LobbyPage from "@/domains/lobby/pages/LobbyPage";
import RoomInvitePage from "@/domains/lobby/pages/RoomInvitePage";

import GameModePage from "@/domains/game/pages/GameModePage";

import MyPage from "@/domains/user/pages/MyPage";
import SettingPage from "@/domains/user/pages/SettingPage";

import StorePage from "@/domains/store/pages/StorePage";

export const router = createBrowserRouter([
    { path: "/", element: <HomePage /> },
    { path: "/login", element: <LoginPage /> },
    { path: "/lobby", element: <LobbyPage /> },
    { path: "/roomInvite", element: <RoomInvitePage /> },
    { path: "/gameMode", element: <GameModePage /> },
    { path: "/mypage", element: <MyPage /> },
    { path: "/setting", element: <SettingPage /> },
    { path: "/store", element: <StorePage /> },
]);