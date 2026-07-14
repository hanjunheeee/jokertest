import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/domains/auth/store/auth.store";
import { setSocket } from "@/shared/socket/socketClient";

// 백엔드 socket.io 서버 주소입니다.
// HTTP API 기본 주소와 같은 서버를 사용합니다.
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

// 로그인 상태에 맞춰 socket.io 연결을 만들고 정리하는 공통 훅입니다.
export function useSocket() {
    // 로그인한 상태일 때만 socket 연결을 만듭니다.
    const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

    // 서버가 강제 접속 종료를 알렸을 때 전역 로그인 상태를 비우기 위한 함수입니다.
    const logout = useAuthStore((state) => state.logout);

    // 도메인별 소켓 이벤트 훅에 넘겨줄 현재 socket 인스턴스입니다.
    const [socketInstance, setSocketInstance] = useState(null);

    // 현재 socket 인스턴스를 보관합니다.
    // 값이 바뀌어도 화면을 다시 그릴 필요가 없으므로 useRef를 씁니다.
    const socketRef = useRef(null);

    useEffect(() => {
        // 로그인하지 않은 상태에서는 socket 연결을 만들지 않습니다.
        if (!isLoggedIn) return;

        // 쿠키 기반 인증을 위해 withCredentials를 켜고, websocket 방식으로 연결합니다.
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ["websocket"],
        });

        // 이 훅 안에서는 ref로 보관합니다.
        socketRef.current = socket;

        // App 같은 상위 컴포넌트에서 도메인별 소켓 이벤트 훅에 넘길 수 있게 state에도 저장합니다.
        setSocketInstance(socket);

        // 컴포넌트 밖의 다른 파일에서도 getSocket()으로 꺼내 쓸 수 있게 저장합니다.
        setSocket(socket);

        socket.on("force_disconnect", (payload) => {
            alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
            logout();
            window.location.replace("/login");
        });

        // TODO: match_found — 매칭 도메인 만들 때 추가

        socket.on("connect_error", (error) => {
            console.error("[소켓 연결 실패]", error.message);
        });

        return () => {
            // 등록했던 이벤트 리스너를 제거합니다.
            socket.off("force_disconnect");
            socket.off("connect_error");

            // socket 연결을 끊습니다.
            socket.disconnect();

            // 이 훅 안의 ref를 비웁니다.
            socketRef.current = null;

            // 컴포넌트 밖에서 꺼내 쓰는 전역 socket 참조도 비웁니다.
            setSocket(null);

            // App에 넘기던 socket 인스턴스도 비웁니다.
            setSocketInstance(null);
        };
    }, [isLoggedIn, logout]);

    return socketInstance;
}
