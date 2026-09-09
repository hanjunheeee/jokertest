import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../../domains/auth/store/auth.store.js";
import { setSocket } from "../socket/socketClient.js";
import { refreshAccessToken } from "../api/client.js";
// client.js와 마찬가지로 상대 경로다 — node:test의 mock.module이 "@/..." Vite 별칭을
// 해석하지 못해, 이 훅을 실제 코드로 테스트하려면 여기서부터 상대 경로로 가야
// 한다(F-03 R-IMPL #6).
import { API_BASE_URL } from "../env.js";

// 백엔드 socket.io 서버 주소입니다.
// HTTP API 기본 주소와 같은 서버를 사용합니다.
const SOCKET_URL = API_BASE_URL;

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

        // 액세스 토큰이 만료된 채로 연결(또는 재연결)을 시도하면 백엔드의 authenticateSocket이
        // "UNAUTHORIZED"로 거부합니다(F-03 AC-05). apiClient.js의 refreshAccessToken()과
        // 같은 진행 중인 갱신 요청을 공유해 갱신 자격을 불필요하게 여러 번 회전시키지 않습니다.
        // HTTP 갱신이 성공했는데도 소켓이 계속 UNAUTHORIZED를 돌려주는 상황(쿠키 전파 지연,
        // 그 사이 세션이 다시 폐기됨 등)이 있을 수 있어, "갱신 성공"만으로는 무한 재시도를
        // 막지 못한다 — reauthAttempts로 handshake 실패 자체의 횟수를 별도로 제한해야
        // 한다(F-03 R-IMPL #6). 상한에 도달하면 갱신 성공 여부와 무관하게 재시도를 멈추고
        // 로그아웃 상태로 되돌린다(force_disconnect와 동일한 사용자 상태 정리).
        const MAX_REAUTH_ATTEMPTS = 2;
        let reauthAttempts = 0;
        let reauthExhausted = false;
        let cancelled = false;
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
                // cleanup(언마운트·로그아웃) 이후에는 이 소켓을 다시 연결하면 안 됩니다 —
                // 이미 disconnect()된 소켓을 되살리면 다음 로그인의 소켓과 뒤섞일 수 있습니다.
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
            // 어떤 재시도(refreshAccessToken 응답 대기 중이던 것 포함)도 이 cleanup 이후에는
            // socket.connect()를 다시 부르지 못하게 막습니다.
            cancelled = true;

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
