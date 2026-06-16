import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/domains/auth/store/authStore";
import { useFriendStore } from "@/domains/lobby/store/friendStore";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * @desc    실시간 유저 세션(다중 접속 제어) / 친구 상태 동기화를 위한 Socket.io 연결 훅입니다.
 *          로그인 상태(isLoggedIn)에 맞춰 연결을 생성·해제하며, 컴포넌트 트리 어디서든
 *          한 번만 호출하면 됩니다(App.jsx 최상단 권장).
 *
 *          수신 이벤트
 *          ┌──────────────────────────────────────────────────────────────┐
 *          │  force_disconnect    다른 기기/탭에서 로그인되어 강제 종료됨    │
 *          │  friend_status_change 친구의 ONLINE/OFFLINE 상태 변경 알림     │
 *          └──────────────────────────────────────────────────────────────┘
 *
 * @returns {React.MutableRefObject} 현재 연결된 socket 인스턴스 ref (없으면 null)
 */
export function useSocket() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const logout = useAuthStore((state) => state.logout);
  const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

  const socketRef = useRef(null);

  useEffect(() => {
    // 로그인 상태가 아니면 연결할 필요가 없음 (쿠키 자체가 없거나 이미 로그아웃된 상태)
    if (!isLoggedIn) return;

    // withCredentials: true → HttpOnly 쿠키(accessToken)를 핸드셰이크 요청에 포함시킴
    // (REST 요청에서 fetch의 credentials: "include"와 동일한 역할)
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"], // 폴링 fallback 없이 웹소켓으로 고정 (불필요한 핸드셰이크 지연 방지)
    });
    socketRef.current = socket;

    /**
     * 다른 기기/탭에서 로그인하여 서버가 이 소켓을 강제로 끊은 경우.
     * - 쿠키/Zustand 상태가 남아있어도 더 이상 유효한 세션이 아니므로 즉시 로그아웃 처리한다.
     * - alert()는 동기적으로 화면을 막으므로, 사용자가 확인을 누른 뒤 리다이렉트가 실행된다.
     */
    socket.on("force_disconnect", (payload) => {
      alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
      logout();
      window.location.replace("/login");
    });

    /**
     * 친구의 접속 상태가 바뀌었다는 알림 — 친구 목록 전체를 다시 불러오지 않고
     * Zustand 스토어에서 해당 친구 항목만 갱신한다 (불필요한 API 재호출 방지).
     */
    socket.on("friend_status_change", ({ uuid, status }) => {
      updateFriendStatus(uuid, status);
    });

    /**
     * 연결 자체가 실패한 경우 (서버 다운, 쿠키 만료로 인한 핸드셰이크 인증 거부 등).
     * 401 처리는 REST 쪽(client.js)에서 이미 담당하므로 여기서는 로깅만 하고
     * 무한 재연결 시도는 socket.io-client 기본 동작(reconnection: true)에 맡긴다.
     */
    socket.on("connect_error", (error) => {
      console.error("[소켓 연결 실패]", error.message);
    });

    // 컴포넌트 언마운트되거나 isLoggedIn이 false로 바뀌면(로그아웃) 연결을 정리한다.
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
