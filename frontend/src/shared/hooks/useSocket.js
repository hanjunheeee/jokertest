// 로그인 동안 공용 소켓 연결 유지: 강제 끊김이면 로그아웃, 인증 실패면 토큰 갱신 뒤 다시 연결
// App이 씀, 연결 만들기·이벤트 받기는 shared/socket/connection.js가 맡음
import { useEffect, useRef, useState } from "react";
import { connectSocket, onConnection } from "../socket/connection.js";
import { useAuthStore } from "../../domains/auth/store/auth.store.js";
import { setSocket } from "../socket/socketClient.js";
import { refreshAccessToken } from "../api/client.js";
import { API_BASE_URL } from "../env.js";

const SOCKET_URL = API_BASE_URL;

// 로그인이면 연결, 로그아웃·계정이 바뀌면 끊고 다시 연결 (계정 uuid도 의존값)
export function useSocket() {
    const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

    const accountUuid = useAuthStore((state) => state.user?.uuid ?? null);

    const logout = useAuthStore((state) => state.logout);

    const [socketInstance, setSocketInstance] = useState(null);

    const socketRef = useRef(null);

    useEffect(() => {
        if (!isLoggedIn) return;

        const socket = connectSocket(SOCKET_URL);

        socketRef.current = socket;

        setSocketInstance(socket);

        // 다른 영역은 socketClient.js로 같은 소켓을 꺼내 씀
        setSocket(socket);

        // 토큰 갱신 뒤 다시 연결은 2번까지, cancelled는 정리 뒤 늦게 온 결과 무시용
        const MAX_REAUTH_ATTEMPTS = 2;
        let reauthAttempts = 0;
        let reauthExhausted = false;
        let cancelled = false;

        // 받는 순서는 예전 그대로: 강제 끊김 → 연결 → 연결 실패
        const offConnection = onConnection(socket, {
            // 다른 곳 로그인으로 서버가 끊으면 알리고 로그아웃
            forceDisconnect: (payload) => {
                alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
                logout();
                window.location.replace("/login");
            },
            // 연결되면 재인증 횟수 처음부터
            connect: () => {
                reauthAttempts = 0;
            },
            // 인증 실패만 토큰 갱신 뒤 다시 연결, 두 번 넘게 실패하면 로그아웃
            connectError: (error) => {
                console.error("[소켓 연결 실패]", error.message);
                if (error.message !== "UNAUTHORIZED" || reauthExhausted || cancelled) return;

                reauthAttempts += 1;
                if (reauthAttempts > MAX_REAUTH_ATTEMPTS) {
                    reauthExhausted = true;
                    logout();
                    window.location.replace("/login");
                    return;
                }

                refreshAccessToken().then((refreshed) => {
                    // 갱신 기다리는 사이 정리됐으면 무시
                    if (cancelled) return;

                    // 갱신되면 같은 소켓으로 다시 연결, 실패면 로그아웃
                    if (refreshed) {
                        socket.connect();
                    } else {
                        reauthExhausted = true;
                        logout();
                        window.location.replace("/login");
                    }
                });
            },
        });

        // 정리: 늦게 온 갱신 무시, 받기 끄고 끊고 공용 소켓 비움
        return () => {
            cancelled = true;

            offConnection();

            socket.disconnect();

            socketRef.current = null;

            setSocket(null);

            setSocketInstance(null);
        };
    }, [isLoggedIn, accountUuid, logout]);

    return socketInstance;
}
