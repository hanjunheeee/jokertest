// 로그인 동안 공용 소켓 연결 유지: 강제 끊김이면 로그아웃, 인증 실패면 토큰 갱신 뒤 다시 연결, 서버 점검이면 안내만, WRONG_NODE면 그 Node로
// App이 씀, 연결 만들기·이벤트 받기는 shared/socket/connection.js, Node 힌트는 nodeHint.js가 맡음
import { useEffect, useRef, useSyncExternalStore } from "react";
import { connectSocket, followWrongNode, onConnection } from "../socket/connection.js";
import { clearNodeHint, createBounceCounter, readNodeHint, setNodeHintAccount } from "../socket/nodeHint.js";
import { useAuthStore } from "../../domains/auth/store/auth.store.js";
import { getSocket, setSocket, subscribeSocket } from "../socket/socketClient.js";
import { refreshAccessToken } from "../api/client.js";
import { API_BASE_URL } from "../env.js";
import { SERVER_SHUTDOWN_NOTICE } from "../constants/connectionSocket.js";

const SOCKET_URL = API_BASE_URL;

// 서버 force_disconnect code: 같은 로그인 세션(같은 브라우저 다른 탭)에 밀림
export const SAME_SESSION_REPLACED = "REPLACED_BY_SAME_SESSION";

// 서버 force_disconnect code → 기본 문구 (서버 문구가 없을 때)
export const FORCE_DISCONNECT_MESSAGES = {
    ACCOUNT_BANNED: "정지된 계정입니다. 운영정책을 확인해주세요.",
    ACCOUNT_INACTIVE: "이용할 수 없는 계정입니다.",
    ACCOUNT_WITHDRAWN: "회원 탈퇴가 완료되었습니다.",
    SESSION_EXPIRED: "로그인 유지 시간이 지났습니다. 다시 로그인해주세요.",
};

// WRONG_NODE 따라가기: 알려 준 Node로 다시 붙음 (바로 또는 잠깐 쉬고), 정리 뒤엔 안 붙음
// 돌려줌: handle(error)는 WRONG_NODE를 맡았으면 true, stop()은 쉬는 중 다시 붙기 취소
function startNodeFollow(socket, isCancelled) {
    const bounces = createBounceCounter();
    let retryTimer = null;
    return {
        handle(error) {
            const waitMs = followWrongNode(socket, error, bounces);
            if (waitMs === null) return false;
            if (isCancelled()) return true;
            if (waitMs === 0) {
                socket.connect();
                return true;
            }
            clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                retryTimer = null;
                if (!isCancelled()) socket.connect();
            }, waitMs);
            return true;
        },
        stop() {
            clearTimeout(retryTimer);
            retryTimer = null;
        },
    };
}

// 토큰 갱신 뒤 다시 연결은 2번까지
const MAX_REAUTH_ATTEMPTS = 2;

// 로그아웃하고 로그인 화면으로
function logoutToLogin(logout) {
    logout();
    window.location.replace("/login");
}

// 같은 브라우저 다른 탭이 밀어낸 것이면 안내만 (로그아웃·/login 가면 쿠키로 다시 로그인돼 탭끼리 번갈아 끊김, known 1-15)
// 다른 기기·다른 로그인이면 알리고 로그아웃
function handleForceDisconnect(payload, logout) {
    if (payload?.code === SAME_SESSION_REPLACED) {
        alert(payload?.message || "같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.");
        return;
    }
    alert(payload?.message || FORCE_DISCONNECT_MESSAGES[payload?.code] || "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.");
    logoutToLogin(logout);
}

// 인증 실패만 토큰 갱신 뒤 다시 연결, 두 번 넘게 실패하면 로그아웃
// state: { reauthAttempts, reauthExhausted, cancelled } (cancelled는 정리 뒤 늦게 온 결과 무시용)
function reauthAfterError(error, socket, state, logout) {
    if (error.message !== "UNAUTHORIZED" || state.reauthExhausted || state.cancelled) return;

    state.reauthAttempts += 1;
    if (state.reauthAttempts > MAX_REAUTH_ATTEMPTS) {
        state.reauthExhausted = true;
        logoutToLogin(logout);
        return;
    }

    refreshAccessToken().then((refreshed) => {
        // 갱신 기다리는 사이 정리됐으면 무시
        if (state.cancelled) return;

        // 갱신되면 같은 소켓으로 다시 연결, 실패면 로그아웃
        if (refreshed) {
            socket.connect();
        } else {
            state.reauthExhausted = true;
            logoutToLogin(logout);
        }
    });
}

// 소켓 받기 붙임, 받는 순서는 예전 그대로: 강제 끊김 → 연결 → 연결 실패
// 돌려줌: 정리 함수 (늦게 온 갱신 무시, 쉬는 중 다시 붙기 취소, 받기 끔)
function startConnectionHandlers(socket, logout) {
    const state = { reauthAttempts: 0, reauthExhausted: false, cancelled: false };
    const nodeFollow = startNodeFollow(socket, () => state.cancelled);

    const offConnection = onConnection(socket, {
        forceDisconnect: (payload) => handleForceDisconnect(payload, logout),
        // 서버 점검·업데이트로 곧 끊김: 안내만 (모바일은 alert가 양피지 창), 로그아웃·끊기 안 함
        // 끊긴 뒤엔 socket.io가 알아서 다시 연결, 판 중이면 connect 뒤 판 쪽 스냅샷 다시 묻기로 복구
        serverShutdown: () => {
            alert(SERVER_SHUTDOWN_NOTICE);
        },
        // 연결되면 재인증 횟수 처음부터
        connect: () => {
            state.reauthAttempts = 0;
        },
        // WRONG_NODE면 그 Node로, 아니면 재인증
        connectError: (error) => {
            if (nodeFollow.handle(error)) return;
            console.error("[소켓 연결 실패]", error.message);
            reauthAfterError(error, socket, state, logout);
        },
    });

    return () => {
        state.cancelled = true;
        nodeFollow.stop();
        offConnection();
    };
}

// 로그인 → 로그아웃으로 바뀔 때 Node 힌트 지움 (다음 사람이 옛 Node로 안 가게)
function useClearHintOnLogout(isLoggedIn) {
    const wasLoggedInRef = useRef(isLoggedIn);
    useEffect(() => {
        if (wasLoggedInRef.current && !isLoggedIn) {
            clearNodeHint();
            setNodeHintAccount(null);
        }
        wasLoggedInRef.current = isLoggedIn;
    }, [isLoggedIn]);
}

// 로그인이면 연결, 로그아웃·계정이 바뀌면 끊고 다시 연결 (계정 uuid도 의존값)
export function useSocket() {
    const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

    const accountUuid = useAuthStore((state) => state.user?.uuid ?? null);

    const logout = useAuthStore((state) => state.logout);

    // 돌려줄 소켓은 공용 소켓 칸(socketClient.js)을 그대로 읽음, 넣고 빼면 다시 그림
    const socketInstance = useSyncExternalStore(subscribeSocket, getSocket);

    const socketRef = useRef(null);

    useClearHintOnLogout(isLoggedIn);

    useEffect(() => {
        if (!isLoggedIn) return;

        // 이 계정 힌트가 있으면 그 Node로 바로 (새로고침해도 판·방 Node로), 없으면 예전과 같은 연결
        setNodeHintAccount(accountUuid);
        const socket = connectSocket(SOCKET_URL, { node: readNodeHint() });

        socketRef.current = socket;

        // 다른 영역도 socketClient.js로 같은 소켓을 꺼내 씀 (이 훅의 돌려주는 값도 여기서 바뀜)
        setSocket(socket);

        // 강제 끊김·점검 안내·재인증·WRONG_NODE 받기 시작
        const stopHandlers = startConnectionHandlers(socket, logout);

        // 정리: 늦게 온 갱신 무시, 받기 끄고 끊고 공용 소켓 비움
        return () => {
            stopHandlers();

            socket.disconnect();

            socketRef.current = null;

            setSocket(null);
        };
    }, [isLoggedIn, accountUuid, logout]);

    return socketInstance;
}
