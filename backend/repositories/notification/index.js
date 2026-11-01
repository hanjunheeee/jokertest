'use strict';

// 알림 저장소 입구, 알림 행 쿼리 모아서 내보냄
// 알림 서비스가 이 입구로 부름
module.exports = {
    ...require('./notification'),
};
