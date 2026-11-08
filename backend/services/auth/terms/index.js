'use strict';

// 약관 입구 파일, 지금 약관 읽기 + 가입 동의 검사·기록 + 재동의
// 가입 서비스 둘·약관 컨트롤러가 이 객체로 부름 (시험이 함수를 갈아끼우기 때문에 입구 남김)
const { getCurrentTerms, pickCurrentVersions } = require('./current');
const { checkSignupAgreements, recordAgreements, getPendingTerms, agreeToTerms } = require('./agreements');

module.exports = {
    getCurrentTerms,
    pickCurrentVersions,
    checkSignupAgreements,
    recordAgreements,
    getPendingTerms,
    agreeToTerms,
};
