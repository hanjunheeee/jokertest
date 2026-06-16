/**
 * @file useSocket.js
 * @desc 로그인 상태에 따라 Socket.io 연결을 생성·해제하는 훅.
 *       App.jsx 최상단에 한 번만 마운트하면 됩니다.
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/domains/auth/store/authStore";
import { useFriendStore } from "@/domains/lobby/store/friendStore";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * 실시간 소켓 연결을 관리합니다.
 * - `force_disconnect`: 다른 기기 로그인으로 서버가 강제 종료 → 로그아웃 + 리다이렉트
 * - `friend_status_change`: 친구 접속 상태 변경 → 스토어 개별 갱신 (API 재호출 없음)
 * @returns {React.MutableRefObject<import('socket.io-client').Socket|null>}
 */
export function useSocket() {
    const isLoggedIn         = useAuthStore((state) => state.isLoggedIn);
    const logout             = useAuthStore((state) => state.logout);
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    const socketRef = useRef(null);

    useEffect(() => {
        if (!isLoggedIn) return;

        // withCredentials: true — HttpOnly 쿠키를 핸드셰이크에 포함 (fetch의 credentials: "include"와 동일)
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("force_disconnect", (payload) => {
            // alert는 동기적으로 화면을 막으므로 확인 후 리다이렉트가 실행됨
            alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
            logout();
            window.location.replace("/login");
        });

        socket.on("friend_status_change", ({ uuid, status }) => {
            updateFriendStatus(uuid, status);
        });

        socket.on("connect_error", (error) => {
            console.error("[소켓 연결 실패]", error.message);
        });

        return () => {
            socket.off("force_disconnect");
            socket.off("friend_status_change");
            socket.off("connect_error");
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isLoggedIn, logout, updateFriendStatus]);

    return socketRef;
}
