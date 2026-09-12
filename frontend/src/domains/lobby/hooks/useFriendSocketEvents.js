import { useEffect } from "react";
import { useFriendStore } from "@/domains/lobby/store/friend.store";
import { useAuthStore } from "@/domains/auth/store/auth.store";
import { dispatchSfxEvent } from "@/shared/hooks/useSfxRuntime.js";
import { useNotificationsStore } from "@/domains/notifications/store/notifications.store.js";

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

// 친구 도메인에서 사용하는 socket 이벤트만 연결하는 훅입니다.
export function useFriendSocketEvents(socket) {
    // 친구 접속 상태가 바뀌었을 때 store 안의 친구 상태를 갱신하는 함수입니다.
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    // 친구 요청 수락처럼 친구 목록이 바뀌는 이벤트가 오면 목록을 다시 가져오는 함수입니다.
    const fetchFriends = useFriendStore((state) => state.fetchFriends);

    // 새 친구 요청이 도착했을 때 받은 요청 목록을 다시 가져오는 함수입니다.
    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);

    // 내가 보낸 친구 요청이 수락/거절되면 보낸 요청 표시를 지우는 함수입니다.
    const removeSentRequest = useFriendStore((state) => state.removeSentRequest);

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

        socket.on("friend_status_change", handleFriendStatusChange);
        socket.on("friend_request_received", handleFriendRequestReceived);
        socket.on("friend_request_accepted", handleFriendRequestAccepted);
        socket.on("friend_request_declined", handleFriendRequestDeclined);

        return () => {
            // 이 훅에서 등록한 친구 이벤트만 제거합니다. 각 off는 등록할 때와 **동일한 함수
            // 참조**로 호출합니다 — event명만으로 off하면 같은 이벤트에 대한 다른 구독자의
            // 리스너까지 함께 지워집니다(useMatchingRoom·useGameSessionSocketEvents 관례).
            socket.off("friend_status_change", handleFriendStatusChange);
            socket.off("friend_request_received", handleFriendRequestReceived);
            socket.off("friend_request_accepted", handleFriendRequestAccepted);
            socket.off("friend_request_declined", handleFriendRequestDeclined);
        };
    }, [socket, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);
}
