// 접속 상태 파일, 내 접속 상태 저장 + 수락한 친구 uuid 목록
// socket/connection/presence.js가 접속·끊김 때 부름 (시험은 이 모듈 함수 갈아끼움)
const friendshipRepository = require("../../repositories/friend/friendship");
const onlinePresenceRepository = require("../../repositories/presence/onlinePresence");

// 접속 상태 한 줄 넣거나 고침 (마지막 활동 시각도 같이)
exports.setPresence = async (uuid, status) => {
    await onlinePresenceRepository.upsertOnlinePresence(uuid, status);
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
// 서버 한 대 기준: 여러 대가 되면 서버별 접속 기록으로 바꿔야 함 (다른 서버 접속자까지 지움)
exports.resetPresencesOnBoot = async (bootAt = new Date()) =>
    onlinePresenceRepository.markOfflineBefore(bootAt);
