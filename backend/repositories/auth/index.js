'use strict';

// 인증 저장소 입구, 가입 이메일 인증·비번 재설정 토큰·아이디 찾기 요청 쿼리 모아서 내보냄
// 인증 서비스가 이 입구로 부름
module.exports = {
    ...require('./signupEmailVerification'),
    ...require('./passwordResetToken'),
    ...require('./accountFindRequest'),
};
