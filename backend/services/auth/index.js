'use strict';

// 인증 카테고리 입구, 계정·소셜·가입 이메일 인증·비번 재설정·아이디 찾기 이름 모아서 내보냄
// 부르는 곳은 하위 입구(./account 등)를 씀 (시험이 그 객체 함수를 갈아끼우므로 이 묶음은 복사본)
const account = require('./account');
const social = require('./social');
// 시험 손잡이 __testables는 가입 인증·비번 재설정 둘 다 있어 겹침 → 하위 입구에서만
const { __testables: signupEmailVerificationTestables, ...signupEmailVerification } = require('./signupEmailVerification');
const { __testables: passwordResetTestables, ...passwordReset } = require('./passwordReset');
const { findId } = require('./accountRecovery');
// 구글·디스코드는 함수 이름이 같아 펼치지 않고 묶음으로
const { google, discord } = require('./oauth');

module.exports = {
    ...account,
    ...social,
    ...signupEmailVerification,
    ...passwordReset,
    findId,
    google,
    discord,
};
