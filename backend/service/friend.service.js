// 필요한 모듈 불러오기
// DB에서 친구 관계 및 접속 상태를 조회하는 레포지토리를 가져옵니다.
const friendRepository = require("../repositories/friend.repositories");

// 서비스 계층 로직 정의
/**
 * @desc    내 친구 목록 및 접속 상태 조회 비즈니스 로직
 * DB에서 수락된 친구 관계를 찾아 상대방의 정보(닉네임, 프로필)를 추출하고,
 * 각 친구의 현재 온라인 상태를 조합하여 프론트엔드에서 쓰기 편한 형태로 반환합니다.
 * @param   {String} myUuid - 현재 로그인한 유저의 UUID
 * @returns {Promise<Array>} 가공된 친구 목록 배열 반환 [{ id, name, profile, status, online, isFavorite }]
 */
exports.getFriendList = async (myUuid) => {
    // 내가 요청했거나 받은 '수락 완료된' 친구 관계를 모두 가져옵니다.
    const friendships = await friendRepository.findFriendship(myUuid);

    // 가져온 친구 관계를 순회하며 상대방 정보와 접속 상태를 조합합니다.
    const friendList = await Promise.all(friendships.map(async (f) => {
        // 내가 요청자(requester)라면 Friend2가 친구이고, 수락자라면 Friend1이 친구입니다.
        const isRequester = f.requester_id === myUuid;
        const friendInfo = isRequester ? f.Friend2 : f.Friend1;

        // 해당 친구의 현재 접속 상태를 DB에서 조회합니다.
        const presence = await friendRepository.findOnlinePresence(friendInfo.uuid);

        // 프론트엔드 컴포넌트에서 요구하는 데이터 규격에 맞춰 객체를 생성합니다.
        return {
            id: friendInfo.uuid,
            name: friendInfo.nickname,
            profile: friendInfo.profile_image_url || '/assets/default_profile.png',
            status: presence ? presence.status : 'OFFLINE', 
            online: presence && presence.status !== 'OFFLINE', 
            isFavorite: false // 추후 DB에 즐겨찾기(is_favorite) 컬럼이 추가되면 연동할 자리입니다.
        };
    }));

    return friendList;
}