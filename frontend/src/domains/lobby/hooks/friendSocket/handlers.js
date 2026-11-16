// 친구·게임 초대 소켓 사건을 받았을 때 할 일 묶음
// useFriendSocketEvents 훅이 연결마다 만들어 friend.socket.js로 붙임
import { useFriendStore } from "../../store/friend.store.js";
import { useGameInviteStore } from "../../store/gameInvite.store.js";
import { useAuthStore } from "../../../auth/store/auth.store.js";
import { loadInviteSnapshotAndPlayNew, playFriendSfx, playGameInviteSfx } from "./inviteSfx.js";

// 로그인 계정 id (없으면 null)
const myAccountId = () => {
    const { user, isLoggedIn } = useAuthStore.getState();
    return isLoggedIn && user?.uuid ? user.uuid : null;
};

// 보낸 신청 목록은 친구 추가 탭을 연 적 있을 때만 다시 받음 (안 연 사람에게 요청을 늘리지 않기)
const refreshOutgoingIfLoaded = () => {
    const store = useFriendStore.getState();
    if (store.outgoingStatus !== "idle") store.fetchOutgoingRequests();
};

// 훅이 고른 스토어 액션을 받아 사건별 처리 함수를 만듦
export function makeFriendHandlers({ updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest }) {
    return {
        // 친구 접속 상태 바뀜: 목록 줄만 고침
        statusChange: ({ uuid, status }) => {
            updateFriendStatus(uuid, status);
        },

        // 친구 신청 받음: 받은 신청 다시 받고 소리
        requestReceived: (payload) => {
            fetchIncomingRequests();
            playFriendSfx(payload?.sfxEvent);
        },

        // 내 신청 수락됨: 친구 목록 다시 받고 보낸 표시 지움
        requestAccepted: (payload) => {
            fetchFriends();

            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        },

        // 내 신청 거절됨: 보낸 표시만 지움
        requestDeclined: (payload) => {
            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        },

        // 관계가 바뀌면 친구·받은 신청·차단·초대를 모두 다시 받음 (차단·신청 취소·친구 끊기가 이 사건으로 옴)
        relationInvalidated: () => {
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchBlocks();
            refreshOutgoingIfLoaded();
            loadInviteSnapshotAndPlayNew();
        },

        // 초대 받음: 소리 판정·진단 먼저, 그다음 목록에 넣음 (복원 중이면 목록엔 넣고 소리는 스냅샷 뒤로)
        inviteReceived: (payload) => {
            const accountId = myAccountId();
            playGameInviteSfx(payload);
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite, payload?.sfxEvent ?? null);
        },

        // 초대 상태 바뀜: 목록만 고침 (소리 없음)
        inviteUpdated: (payload) => {
            const accountId = myAccountId();
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite, null);
        },

        // (재)접속하면 계정을 맞추고 목록·초대 스냅샷을 새로 받음
        connect: () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
            useGameInviteStore.getState().beginResync();
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchFavorites();
            refreshOutgoingIfLoaded();
            loadInviteSnapshotAndPlayNew();
        },
    };
}
