'use strict';

// 공통 저장소 입구, 트랜잭션 열기 · DB 오류 판정 모아서 내보냄
// 카테고리 저장소·서비스가 이 입구로 부름
module.exports = {
    ...require('./transaction'),
    ...require('./errors'),
};
