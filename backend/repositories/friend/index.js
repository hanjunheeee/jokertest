'use strict';

// 친구 저장소 입구, 게임 초대 쿼리 모아서 내보냄 (friend.repositories 나누기도 나중에 이 폴더로)
// 게임 초대 서비스가 이 입구로 부름
module.exports = {
    ...require('./gameInvite'),
};
