'use strict';

// 아이디 찾기 요청 저장소 파일, 요청 기록 한 줄
// 아이디 찾기 서비스(services/auth/accountRecovery.js)가 부름, 기록만 하고 읽는 곳 없음
const db = require('../../models');

// 아이디 찾기 요청 기록, 이메일 없이 IP만 (쿼리 로그도 끔)
const recordFindId = (ipAddress) => db.AccountFindRequest.create({
    email: null,
    request_type: 'FIND_ID',
    ip_address: ipAddress,
}, { logging: false });

module.exports = {
    recordFindId,
};
