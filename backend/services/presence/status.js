// 접속 상태 파일, 내 접속 상태 저장 + 수락한 친구 uuid 목록
// socket/connection/presence.js가 접속·끊김 때 부름 (시험은 이 모듈 함수 갈아끼움)
const friendshipRepository = require("../../repositories/friend/friendship");
const onlinePresenceRepository = require("../../repositories/presence/onlinePresence");

// 이 Node 이름은 cluster 한 곳에서만 받음 (SERVER_ID 읽는 곳이 둘이면 어긋날 수 있음)
// 단일 모드도 cluster가 같은 규칙(config/serverId)으로 읽어 예전 값 그대로, 부를 때 읽음 (순환 require 피하기)
const currentServerId = () => require("../../cluster").serverId();

// 접속 상태 한 줄 넣거나 고침 (마지막 활동 시각·이 서버 이름도 같이)
// Node 여러 개(REDIS_URL 있음)면 OFFLINE은 이 서버 줄일 때만 씀 → 다른 Node의 ONLINE을 안 덮음 (MN-068)
// 단일 모드는 예전 그대로 upsert (cluster는 부를 때 읽음, 순환 require 피하기)
exports.setPresence = async (uuid, status) => {
    if (status === "OFFLINE" && require("../../cluster").isEnabled()) {
        await onlinePresenceRepository.markOfflineIfOwner(uuid, currentServerId());
        return;
    }
    await onlinePresenceRepository.upsertOnlinePresence(uuid, status, currentServerId());
};

// 수락한 친구 관계마다 내 반대편 uuid만 (접속 상태 알릴 사람)
exports.getAcceptedFriendUuids = async (uuid) => {
    const friendships = await friendshipRepository.findFriendshipUuidsOnly(uuid);

    // 내가 신청한 쪽이면 받은 사람, 아니면 신청한 사람
    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.receiver_id : friendship.requester_id;
    });
};

// 서버 켤 때 접속 상태 되돌리기 (BE-015), index.js가 포트 열기 전 시각을 넘겨 부름
// 이 서버 이름 줄만 (서버 여러 대면 다른 서버 접속자는 그대로, 한 대면 전부 같은 이름이라 예전과 같음)
exports.resetPresencesOnBoot = async (bootAt = new Date(), serverId = currentServerId()) =>
    onlinePresenceRepository.markOfflineBefore(bootAt, serverId);
