import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
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

        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ["websocket"],
        });

        socketRef.current = socket;

        setSocketInstance(socket);

        setSocket(socket);

        socket.on("force_disconnect", (payload) => {
            alert(payload?.message || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
            logout();
            window.location.replace("/login");
        });

        const MAX_REAUTH_ATTEMPTS = 2;
        let reauthAttempts = 0;
        let reauthExhausted = false;
        let cancelled = false;

        socket.on("connect", () => {
            reauthAttempts = 0;
        });
        socket.on("connect_error", (error) => {
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
        });

        return () => {
            cancelled = true;

            socket.off("force_disconnect");
            socket.off("connect_error");
            socket.off("connect");

            socket.disconnect();

            socketRef.current = null;

            setSocket(null);

            setSocketInstance(null);
        };
    }, [isLoggedIn, accountUuid, logout]);

    return socketInstance;
}
