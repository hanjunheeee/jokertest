// 친구·게임 초대 소켓 사건을 받았을 때 할 일 묶음
// useFriendSocketEvents 훅이 연결마다 만들어 friend.socket.js에 붙임
import { useFriendStore } from "../../store/friend.store.js";
import { useGameInviteStore } from "../../store/gameInvite.store.js";
import { useAuthStore } from "../../../auth/store/auth.store.js";
import { loadInviteSnapshotAndPlayNew, playFriendSfx, playGameInviteSfx } from "./inviteSfx.js";

// 로그인 계정 id (없으면 null)
const myAccountId = () => {
    const { user, isLoggedIn } = useAuthStore.getState();
    return isLoggedIn && user?.uuid ? user.uuid : null;
};

// 훅이 고른 스토어 액션을 받아 사건별 처리 함수를 만듦
export function makeFriendHandlers({ updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest }) {
    return {
        statusChange: ({ uuid, status }) => {
            updateFriendStatus(uuid, status);
        },

        requestReceived: (payload) => {
            fetchIncomingRequests();
            playFriendSfx(payload?.sfxEvent);
        },

        requestAccepted: (payload) => {
            fetchFriends();

            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        },

        requestDeclined: (payload) => {
            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        },

        // 관계가 바뀌면 친구·받은 신청·차단·초대를 모두 다시 받음
        relationInvalidated: () => {
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchBlocks();
            loadInviteSnapshotAndPlayNew();
        },

        // 소리 판정을 먼저 하고 목록에 넣음 (넣은 뒤엔 이미 본 초대가 됨)
        inviteReceived: (payload) => {
            const accountId = myAccountId();
            playGameInviteSfx(payload);
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite, payload?.sfxEvent ?? null);
        },

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
            loadInviteSnapshotAndPlayNew();
        },
    };
}
