'use strict';

// 아이디 찾기 요청 저장소 파일, 요청 기록 한 줄
// 아이디 찾기 서비스가 부름 (요청 한도 확인용 기록, 쿼리 로그는 남기지 않음)
const db = require('../../models');

// 아이디 찾기 요청 기록 (이메일 없이 IP만)
const recordFindId = (ipAddress) => db.AccountFindRequest.create({
    email: null,
    request_type: 'FIND_ID',
    ip_address: ipAddress,
}, { logging: false });

module.exports = {
    recordFindId,
};
