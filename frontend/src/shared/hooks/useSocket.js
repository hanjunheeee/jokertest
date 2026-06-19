/**
 * @file useSocket.js
 * @desc 로그인 상태에 따라 Socket.io 연결을 생성·해제하는 훅.
 *       App.jsx 최상단에 한 번만 마운트하면 됩니다.
 *
 * 처리 이벤트:
 *   force_disconnect        → 중복 로그인 강제 종료
 *   friend_status_change    → 친구 온/오프라인 갱신
 *   friend_request_received → 받은 신청 목록 새로고침
 *   friend_request_accepted → 친구 목록 갱신 + sentRequestIds 제거
 *   friend_request_declined → sentRequestIds 제거
 *   match_found             → 매칭 완료 시 matchingStore 업데이트
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/domains/auth/store/authStore";
import { useFriendStore } from "@/domains/lobby/store/friendStore";
import { setSocket } from "@/shared/socket/socketClient";
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

export function useSocket() {
    const isLoggedIn            = useAuthStore((state) => state.isLoggedIn);
    const logout                = useAuthStore((state) => state.logout);
    const updateFriendStatus    = useFriendStore((state) => state.updateFriendStatus);
    const fetchFriends          = useFriendStore((state) => state.fetchFriends);
    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);
    const removeSentRequest     = useFriendStore((state) => state.removeSentRequest);

    const socketRef = useRef(null);

    useEffect(() => {
        if (!isLoggedIn) return;

        // withCredentials: true — HttpOnly 쿠키를 핸드셰이크에 포함 (fetch의 credentials: "include"와 동일)
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ["websocket"],
        });
        socketRef.current = socket;
        setSocket(socket);

        socket.on("force_disconnect", (payload) => {
            // alert는 동기적으로 실행을 차단하므로 확인 후 리다이렉트가 보장됨
            alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
            logout();
            window.location.replace("/login");
        });

        socket.on("friend_status_change", ({ uuid, status }) => {
            updateFriendStatus(uuid, status);
        });

        socket.on("friend_request_received", () => {
            fetchIncomingRequests();
        });

        socket.on("friend_request_accepted", ({ byUuid }) => {
            fetchFriends();
            if (byUuid) removeSentRequest(byUuid);
        });

        socket.on("friend_request_declined", ({ byUuid }) => {
            if (byUuid) removeSentRequest(byUuid);
        });

        socket.on("match_found", (data) => {
            // 매칭 완료 시 store 업데이트 — MultiplayEntryPage가 isInRoom을 감지해 navigate
            useMatchingStore.getState().setRoom(data);
        });

        socket.on("connect_error", (error) => {
            console.error("[소켓 연결 실패]", error.message);
        });

        return () => {
            socket.off("force_disconnect");
            socket.off("friend_status_change");
            socket.off("friend_request_received");
            socket.off("friend_request_accepted");
            socket.off("friend_request_declined");
            socket.off("match_found");
            socket.off("connect_error");
            socket.disconnect();
            socketRef.current = null;
            setSocket(null);
        };
    }, [isLoggedIn, logout, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);

    return socketRef;
}
