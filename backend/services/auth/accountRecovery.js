'use strict';

// 아이디 찾기 파일, 닉네임·생일 맞으면 가린 이메일 돌려줌
// controllers/auth/accountRecovery.js가 부름
const db = require('../../repositories/common/db');
const { maskEmail } = require('../../utils/auth/maskEmail');
const findRequestRepository = require('../../repositories/auth/accountFindRequest');
const userLookup = require('../../repositories/user/lookup');

// 못 찾음은 어느 단계든 같은 결과 (어디서 틀렸는지 안 드러나게)
const NOT_FOUND_RESULT = Object.freeze({ ok: false, code: 'NOT_FOUND' });

// 생일은 UTC 날짜만 비교 (시각 차이로 틀리지 않게)
const sameUtcCalendarDay = (a, b) => (
    a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
);

// 요청 기록 → 닉네임으로 찾기 → 닉네임·생일 같은지 → 가린 이메일
const findId = async ({ nickname, birthDate, ipAddress }) => {
    // 찾기 결과와 상관없이 IP 먼저 기록 (이메일은 안 남김)
    await findRequestRepository.recordFindId(ipAddress);

    const user = await userLookup.findForFindId(db, nickname);

    // 없는 닉네임 거절, DB 비교 규칙에 안 기대고 닉네임 한 번 더 정확히 비교
    if (!user) return NOT_FOUND_RESULT;
    if (typeof user.nickname !== 'string' || user.nickname.trim() !== nickname) return NOT_FOUND_RESULT;
    if (!user.birth_date) return NOT_FOUND_RESULT;

    // 저장된 생일이 못 읽는 날짜거나 다른 날이면 못 찾음
    const storedBirthDate = new Date(user.birth_date);
    if (Number.isNaN(storedBirthDate.getTime()) || !sameUtcCalendarDay(storedBirthDate, birthDate)) {
        return NOT_FOUND_RESULT;
    }

    // 이메일은 가려서만 내보냄
    return { ok: true, maskedEmail: maskEmail(user.email) };
};

module.exports = { findId };
