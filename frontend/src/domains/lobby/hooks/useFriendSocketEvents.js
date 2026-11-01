// 친구·게임 초대 소켓 훅 입구 (이동 함수 등록·계정 맞추기·사건 구독을 붙임)
// App.jsx·친구 목록 패널·시험이 이 경로로 씀
import { useEffect } from "react";
import { useFriendStore } from "../store/friend.store.js";
import { useGameInviteStore } from "../store/gameInvite.store.js";
import { useAuthStore } from "../../auth/store/auth.store.js";
import { syncInviteSfxDiagnosticsAccount } from "../diagnostics/inviteSfxDiagnostics.js";
import { subscribeFriendEvents } from "../socket/friend.socket.js";
import { getNavigate, setNavigate } from "./friendSocket/inviteAccept.js";
import { makeFriendHandlers } from "./friendSocket/handlers.js";

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export { playGameInviteSfx, loadInviteSnapshotAndPlayNew } from "./friendSocket/inviteSfx.js";
export { requestGameInviteAccept } from "./friendSocket/inviteAccept.js";
export { INVITE_ACCEPT_TIMEOUT_MS, INVITE_VERIFY_TIMEOUT_MS } from "../constants/gameInvite.js";
export { canEnterRoom as shouldEnterRoomFromAccept } from "../utils/gameInvite/inviteState.js";

// 앱이 살아 있는 동안 한 번 부름 (socket이 바뀌면 구독을 새로 붙임)
export function useFriendSocketEvents(socket, { navigate } = {}) {
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    const fetchFriends = useFriendStore((state) => state.fetchFriends);

    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);

    const removeSentRequest = useFriendStore((state) => state.removeSentRequest);

    // 초대 수락이 방 화면으로 옮길 때 쓸 이동 함수, 내가 넣은 것일 때만 지움
    useEffect(() => {
        setNavigate(navigate ?? null);
        return () => { if (getNavigate() === navigate) setNavigate(null); };
    }, [navigate]);

    // 로그인 계정이 바뀔 때마다 두 스토어와 진단 기록의 계정을 맞춤
    useEffect(() => {
        const syncAll = () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
            syncInviteSfxDiagnosticsAccount(useGameInviteStore.getState().accountId);
        };
        syncAll();
        return useAuthStore.subscribe(syncAll);
    }, []);

    // 사건 구독, 이미 연결돼 있으면 접속 처리를 바로 한 번 함
    useEffect(() => {
        if (!socket) return;

        const handlers = makeFriendHandlers({ updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest });
        const unsubscribe = subscribeFriendEvents(socket, handlers);

        if (socket.connected) handlers.connect();

        return unsubscribe;
    }, [socket, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);
}

export function __setInviteNavigateForTests(next) {
    setNavigate(next ?? null);
}
