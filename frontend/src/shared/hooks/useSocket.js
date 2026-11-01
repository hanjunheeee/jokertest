// 로그인 동안 공용 소켓 연결 유지: 강제 끊김이면 로그아웃, 인증 실패면 토큰 갱신 뒤 다시 연결
// App이 씀, 연결 만들기·이벤트 받기는 shared/socket/connection.js가 맡음
import { useEffect, useRef, useState } from "react";
import { connectSocket, onConnection } from "../socket/connection.js";
import { useAuthStore } from "../../domains/auth/store/auth.store.js";
import { setSocket } from "../socket/socketClient.js";
import { refreshAccessToken } from "../api/client.js";
import { API_BASE_URL } from "../env.js";

const SOCKET_URL = API_BASE_URL;

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

        setSocket(socket);

        const MAX_REAUTH_ATTEMPTS = 2;
        let reauthAttempts = 0;
        let reauthExhausted = false;
        let cancelled = false;

        // 받는 순서는 예전 그대로: 강제 끊김 → 연결 → 연결 실패
        const offConnection = onConnection(socket, {
            forceDisconnect: (payload) => {
                alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
                logout();
                window.location.replace("/login");
            },
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
                    if (cancelled) return;

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
