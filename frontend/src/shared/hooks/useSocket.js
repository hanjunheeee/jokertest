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
 *
 * 이 훅은 socket.io 연결의 생성·이벤트 구독·해제를 한곳에 캡슐화합니다.
 * 반환값은 소켓 인스턴스를 담은 ref(socketRef)이며, 컴포넌트 밖에서 emit해야 할 때는
 * socketClient.js의 getSocket()을 사용합니다.
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

    // useRef(초기값)은 렌더링 사이에 값을 유지하되, 값이 바뀌어도 리렌더링을 유발하지 않는 훅입니다.
    // socketRef.current에 소켓 인스턴스를 담아두고, 컴포넌트 함수 밖(cleanup 등)에서도 최신 값을 참조합니다.
    const socketRef = useRef(null);

    // useEffect(콜백, 의존성배열): 렌더링 이후 소켓 연결/이벤트 구독 같은 부수효과를 실행하는 훅입니다.
    // 의존성 배열의 값(isLoggedIn 등)이 바뀔 때마다 이전 effect의 cleanup을 먼저 실행한 뒤
    // 콜백을 다시 실행합니다. 즉 로그인 상태가 바뀔 때마다 소켓을 새로 맺거나 끊습니다.
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

        // cleanup 함수: 의존성 값이 바뀌어 effect가 재실행되기 직전, 또는 컴포넌트가
        // 언마운트될 때 호출됩니다. 이전에 등록한 이벤트 리스너와 소켓 연결을 정리해
        // 중복 리스너·좀비 연결이 남지 않도록 합니다.
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
    // 의존성 배열: effect 안에서 참조하는 외부 값(로그인 여부·store 액션들)을 모두 나열합니다.
    // isLoggedIn이 바뀔 때 재연결/해제가 일어나는 것이 핵심이고, 나머지 액션 함수들은
    // effect 내부 클로저가 최신 함수를 참조하도록 하기 위해 포함되어 있습니다.
    }, [isLoggedIn, logout, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);

    // 소켓 인스턴스를 담은 ref를 반환 — 호출한 컴포넌트가 필요하면 socketRef.current로 접근 가능
    return socketRef;
}
