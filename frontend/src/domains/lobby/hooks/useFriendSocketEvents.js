// import 경로는 전부 상대 경로다. 이 훅은 node:test에서 **실제로 마운트**되는데(F-19
// AC-07의 friendInviteRuntime 시험) `@/` 별칭은 vite만 해석할 수 있다 — useSfxRuntime.js가
// 같은 이유로 상대 경로를 쓰는 것과 같은 관례다.
import { useEffect } from "react";
import { useFriendStore } from "../store/friend.store.js";
import { useGameInviteStore } from "../store/gameInvite.store.js";
import { useAuthStore } from "../../auth/store/auth.store.js";
import { dispatchSfxEvent } from "../../../shared/hooks/useSfxRuntime.js";
import { useNotificationsStore } from "../../notifications/store/notifications.store.js";
import { getSocket } from "../../../shared/socket/socketClient.js";
import { useMatchingStore } from "../../game/matching/store/matchingStore.js";
import { useInGameStore } from "../../game/ingame/store/ingameStore.js";

/**
 * 서버가 보낸 친구 사건 봉투를 공통 재생기로 넘긴다(F-16 AC-01/AC-04).
 *
 * 여기서 하는 일은 "이 사건이 지금 이 화면의 계정 것인가"를 한 번 더 대조하는 것뿐이다 —
 * 전달 대상 제한은 서버 emitToUser가 이미 했고, 이 검사는 계정 전환 직후 도착한 늦은
 * 사건을 막는 이중 방어다. 봉투가 없으면(구버전 서버·요청 id를 확정하지 못한 경로) 조용히
 * 아무 소리도 내지 않는다.
 *
 * 목록 재조회(fetchIncomingRequests·fetchFriends·removeSentRequest)는 이 함수와 **독립**으로
 * 실행된다 — 소리의 성공·실패가 목록 갱신을 막거나 되돌리지 않는다(AC-06). 조회 결과로는
 * 새 사건을 만들지 않는다(A-05).
 */
function playFriendSfx(sfxEvent) {
    if (sfxEvent === null || typeof sfxEvent !== "object") return;
    const { user, isLoggedIn } = useAuthStore.getState();
    const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
    if (accountId === null) return;
    // 서버가 수신 경계에서 확인한 계정과 현재 인증 계정이 모두 일치해야 한다.
    if (sfxEvent.accountId !== accountId) return;

    // F-17(A-04): 이 사건의 원본 키로 "지금이 최초 처리인가"를 알림 store에 묻는다.
    // 친구 사건의 eventId(friend-request:<id>:<stage>)는 서버가 저장한 알림 source_key와
    // 같은 문자열이라 별도 매핑이 필요 없다. 목록 복원(GET)에서 이미 본 사건이면 false가
    // 되어 무음이다 — 재로그인·재접속 뒤 서버가 놓친 전달을 다시 보내도 다시 울리지 않는다.
    // true인 순간 표식을 소모하므로, 설정 off·mute로 실제 소리가 안 나도 나중에 설정을
    // 켰다고 과거 사건이 울리지 않는다(A-03).
    if (!useNotificationsStore.getState().consumeSoundEvent(accountId, sfxEvent.eventId)) return;

    dispatchSfxEvent({
        kind: sfxEvent.kind,
        eventId: sfxEvent.eventId,
        accountId,
        origin: sfxEvent.origin,
    });
}

/**
 * F-19(AC-07): 게임 초대 수신음의 **유일한** 판정 경계.
 *
 * 친구 사건과 달리 알림 store의 soundSeen을 쓰지 않는다. 초대는 커서 기반 판정이 필요하고
 * (커서 이하 = 과거), 그 커서는 초대 store만 알고 있기 때문이다 — 두 경계가 각자 판정하면
 * 같은 inviteId에 소리가 두 번 날 수 있다. 그래서 초대는 여기 한 곳에서만 소비한다.
 *
 * 이 함수는 어떤 경우에도 던지지 않고, 재생 완료를 기다리지 않는다 — 소리의 성공·실패가
 * 초대 수락·거절·입장을 막지 않는다(AC-07).
 */
function playGameInviteSfx(payload) {
    const sfxEvent = payload?.sfxEvent;
    const invite = payload?.invite;
    if (sfxEvent === null || typeof sfxEvent !== "object") return;

    const { user, isLoggedIn } = useAuthStore.getState();
    const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
    if (accountId === null) return;
    if (sfxEvent.accountId !== accountId) return;

    // 커서 이후의 실제 신규 수신이고, 최신 상태가 유효한 PENDING일 때만 후보다.
    // true를 받는 순간 표식이 소모되므로 off·mute여도 과거 사건이 나중에 울리지 않는다.
    if (!useGameInviteStore.getState().consumeInviteSound(accountId, invite)) return;

    dispatchSfxEvent({
        kind: sfxEvent.kind,
        eventId: sfxEvent.eventId,
        accountId,
        origin: sfxEvent.origin,
    });
}

// ── 초대 수락 → 대기방 이동의 단일 소유자 ───────────────────────────────────
//
// App은 RouterProvider **밖에서** 이 훅을 호출하므로 useNavigate를 쓸 수 없다. 그래서
// 라우터의 navigate를 콜백으로 주입받아 여기 모듈 경계에 보관한다. 초대 UI·store는 결과를
// 이 경계로 넘길 뿐 스스로 이동하지 않는다 — 이동 소유자가 둘이면 한 번의 수락에 두 번
// 이동하는 경로가 생긴다.
let navigateToApp = null;

/** 수락 ACK 대기 상한. 응답이 유실돼도 화면이 영원히 잠기지 않게 한다. */
export const INVITE_ACCEPT_TIMEOUT_MS = 15000;

/**
 * 수락 결과가 실제 이동 근거인지 판정한다(A-10).
 *
 * durable 영수증(서버가 확인한 PUBLISHED)과 **현재 소속**이 함께 있는 성공 ACK만 이동한다.
 * historical PUBLISHED·현재 무소속·UNKNOWN은 이동 근거가 아니다.
 */
export function shouldEnterRoomFromAccept(result) {
    if (result === null || typeof result !== "object") return false;
    if (result.ok !== true) return false;
    const room = result.room;
    if (room === null || typeof room !== "object") return false;
    return typeof room.roomId === "string" && room.roomId.length > 0;
}

/**
 * 초대를 수락한다(AC-06).
 *
 * 실제 입장은 서버의 소켓 경계가 소유한다 — REST로는 수락하지 않는다. 여기서는 ACK 하나를
 * 기다렸다가, 성공이 확정된 경우에만 **한 번** 이동한다.
 */
export async function requestGameInviteAccept(inviteId) {
    const store = useGameInviteStore.getState();
    if (typeof inviteId !== "string" || inviteId.length === 0) return { ok: false, code: "INVALID_REQUEST" };
    if (store.pendingInviteIds.has(inviteId)) return { ok: false, code: "IN_PROGRESS" };

    const socket = getSocket();
    if (!socket) {
        store.setInviteError(inviteId, "연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return { ok: false, code: "NO_SOCKET" };
    }

    const accountGeneration = store.syncAccount();
    store.markAcceptPending(inviteId, true);
    store.setInviteError(inviteId, null);

    let result;
    try {
        result = await new Promise((resolve) => {
            let settled = false;
            const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
            const timer = setTimeout(() => finish({ ok: false, code: "UNKNOWN", unknown: true }), INVITE_ACCEPT_TIMEOUT_MS);
            socket.emit("accept_game_invite", { inviteId }, (ack) => {
                clearTimeout(timer);
                finish(ack ?? { ok: false, code: "UNKNOWN", unknown: true });
            });
        });
    } finally {
        useGameInviteStore.getState().markAcceptPending(inviteId, false);
    }

    // 계정이 바뀐 뒤 도착한 결과는 새 계정의 화면을 건드리지 않는다.
    if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };

    if (!shouldEnterRoomFromAccept(result)) {
        useGameInviteStore.getState().setInviteError(
            inviteId,
            result?.unknown === true
                ? "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요."
                : (result?.message ?? "초대를 수락하지 못했습니다."),
        );
        // 상태를 서버에서 다시 읽어 화면과 서버를 맞춘다(자동 재시도는 하지 않는다).
        useGameInviteStore.getState().loadSnapshot();
        return result ?? { ok: false, code: "UNKNOWN" };
    }

    // matching store를 설정하기 전에 인게임 store의 이전 gameId를 먼저 무효화한다
    // (useRoomInvitePage의 room_joined 처리와 같은 이유·같은 순서).
    useInGameStore.getState().clearGame();
    useMatchingStore.getState().setRoom(result.room);
    navigateToApp?.("/game-matching");
    return result;
}

// 친구 도메인에서 사용하는 socket 이벤트만 연결하는 훅입니다.
export function useFriendSocketEvents(socket, { navigate } = {}) {
    // 친구 접속 상태가 바뀌었을 때 store 안의 친구 상태를 갱신하는 함수입니다.
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    // 친구 요청 수락처럼 친구 목록이 바뀌는 이벤트가 오면 목록을 다시 가져오는 함수입니다.
    const fetchFriends = useFriendStore((state) => state.fetchFriends);

    // 새 친구 요청이 도착했을 때 받은 요청 목록을 다시 가져오는 함수입니다.
    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);

    // 내가 보낸 친구 요청이 수락/거절되면 보낸 요청 표시를 지우는 함수입니다.
    const removeSentRequest = useFriendStore((state) => state.removeSentRequest);

    // 초대 이동의 단일 소유자로 라우터 navigate를 등록한다.
    useEffect(() => {
        navigateToApp = navigate ?? null;
        return () => { if (navigateToApp === navigate) navigateToApp = null; };
    }, [navigate]);

    /**
     * F-19(A-02): 계정 경계는 **소켓 유무와 무관하게** 지킨다.
     *
     * 예전에는 계정 정리가 어디에도 없어서, 로그아웃하거나 A→B로 전환해도 A의 친구·요청·
     * 즐겨찾기가 store에 남아 B의 화면에 그대로 보였다. 이 구독은 auth store를 직접 보므로
     * 소켓이 아직 없거나 이미 끊긴 순간에도 동작한다.
     */
    useEffect(() => {
        const syncAll = () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
        };
        syncAll();
        return useAuthStore.subscribe(syncAll);
    }, []);

    useEffect(() => {
        // 아직 socket 연결이 만들어지지 않았다면 이벤트를 등록하지 않습니다.
        if (!socket) return;

        const handleFriendStatusChange = ({ uuid, status }) => {
            // 친구가 접속/오프라인 상태로 바뀌면 현재 친구 목록의 상태값만 갱신합니다.
            // 온라인 상태 변경은 "새 요청"이 아니므로 소리를 내지 않습니다(A-05).
            updateFriendStatus(uuid, status);
        };

        const handleFriendRequestReceived = (payload) => {
            // 새 친구 요청이 왔으므로 받은 요청 목록을 서버에서 다시 가져옵니다.
            fetchIncomingRequests();
            playFriendSfx(payload?.sfxEvent);
        };

        const handleFriendRequestAccepted = (payload) => {
            // 내 요청이 수락되면 친구 목록을 다시 가져와 새 친구를 반영합니다.
            fetchFriends();

            // 수락한 사용자를 보낸 요청 목록에서 제거합니다.
            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        };

        const handleFriendRequestDeclined = (payload) => {
            // 거절된 요청도 더 이상 "보낸 요청 중"으로 보여주면 안 됩니다.
            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        };

        /**
         * F-19(AC-05): 차단으로 관계·요청·초대가 무효화됐다는 통지.
         * 어떤 목록도 프런트가 임의로 비우지 않고 **서버에서 다시 읽는다**.
         */
        const handleRelationInvalidated = () => {
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchBlocks();
            useGameInviteStore.getState().loadSnapshot();
        };

        // F-19(AC-06/AC-07): 신규 초대 수신. 목록 반영과 소리 판정은 서로 독립이다 —
        // 목록 반영이 최초 소리를 먼저 먹어버리지 않도록 store가 두 경로를 분리한다.
        const handleGameInviteReceived = (payload) => {
            const { user, isLoggedIn } = useAuthStore.getState();
            const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
            playGameInviteSfx(payload);
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite);
        };

        // 상태 변경(거절·만료·차단 취소·방 소멸)은 신규 수신이 아니라 무음이다.
        const handleGameInviteUpdated = (payload) => {
            const { user, isLoggedIn } = useAuthStore.getState();
            const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite);
        };

        /**
         * 재접속마다 공용 상태를 다시 읽는다.
         *
         * 초대는 **리스너를 이미 단 상태에서** 복원을 시작한다(beginResync → loadSnapshot):
         * 그 사이에 도착한 live는 버퍼에 담겼다가 새 커서로 다시 판정되므로, 복원으로 다시
         * 배달된 과거 초대가 소리를 내지 않는다(A-06).
         */
        const handleConnect = () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
            useGameInviteStore.getState().beginResync();
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchFavorites();
            useGameInviteStore.getState().loadSnapshot();
        };

        socket.on("friend_status_change", handleFriendStatusChange);
        socket.on("friend_request_received", handleFriendRequestReceived);
        socket.on("friend_request_accepted", handleFriendRequestAccepted);
        socket.on("friend_request_declined", handleFriendRequestDeclined);
        socket.on("friend_relation_invalidated", handleRelationInvalidated);
        socket.on("game_invite_received", handleGameInviteReceived);
        socket.on("game_invite_updated", handleGameInviteUpdated);
        socket.on("connect", handleConnect);

        // 이미 연결된 소켓에 나중에 붙었으면 connect 이벤트가 오지 않는다 — 그 경우에도
        // 리스너를 먼저 단 뒤 복원을 시작하는 순서는 같다.
        if (socket.connected) handleConnect();

        return () => {
            // 이 훅에서 등록한 친구 이벤트만 제거합니다. 각 off는 등록할 때와 **동일한 함수
            // 참조**로 호출합니다 — event명만으로 off하면 같은 이벤트에 대한 다른 구독자의
            // 리스너까지 함께 지워집니다(useMatchingRoom·useGameSessionSocketEvents 관례).
            socket.off("friend_status_change", handleFriendStatusChange);
            socket.off("friend_request_received", handleFriendRequestReceived);
            socket.off("friend_request_accepted", handleFriendRequestAccepted);
            socket.off("friend_request_declined", handleFriendRequestDeclined);
            socket.off("friend_relation_invalidated", handleRelationInvalidated);
            socket.off("game_invite_received", handleGameInviteReceived);
            socket.off("game_invite_updated", handleGameInviteUpdated);
            socket.off("connect", handleConnect);
        };
    }, [socket, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);
}

/** 시험 전용 — 이동 소유자를 직접 주입/해제합니다. 런타임 코드에서는 쓰지 않습니다. */
export function __setInviteNavigateForTests(next) {
    navigateToApp = next ?? null;
}
