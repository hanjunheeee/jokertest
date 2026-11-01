'use strict';

// 친구 저장소 입구, 게임 초대 쿼리 모아서 내보냄 (친구 관계 쿼리 relation.js는 직접 부름, 시험이 그 객체를 갈아끼움)
// 게임 초대 서비스가 이 입구로 부름
module.exports = {
    ...require('./gameInvite'),
};
