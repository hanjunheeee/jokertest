'use strict';

// F-29a: 닉네임+생년월일로 계정을 찾아 마스킹된 이메일 힌트만 돌려준다.
//
// AC-02 계약: 닉네임 불일치·계정 없음·생년월일 미등록은 전부 같은 NOT_FOUND로 합친다 —
// 어느 입력이 틀렸는지 응답만으로 구분할 수 없어야 한다. 그래서 아래 판정은 여러 개의
// 원인을 갖지만 실패 경로는 모두 같은 상수(NOT_FOUND_RESULT)로 수렴한다.
const db = require('../models');
const { maskEmail } = require('../utils/maskEmail');

const NOT_FOUND_RESULT = Object.freeze({ ok: false, code: 'NOT_FOUND' });

const sameUtcCalendarDay = (a, b) => (
    a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
);

// 입력은 검증된 {nickname, birthDate(UTC 자정 Date), ipAddress}다.
const findId = async ({ nickname, birthDate, ipAddress }) => {
    // 계정 존재 여부와 무관하게 조회 시도 자체를 먼저 기록한다(AC-06: email 없이 남기는
    // FIND_ID 사건 로그). 저장이 실패하면 그대로 던져 위로 전파한다 — 실패를 성공처럼
    // 숨기지 않는다.
    await db.AccountFindRequest.create({
        email: null,
        request_type: 'FIND_ID',
        ip_address: ipAddress,
    }, { logging: false });

    const user = await db.User.findOne({
        where: { nickname },
        attributes: ['nickname', 'email', 'birth_date'],
        raw: true,
        logging: false,
    });

    if (!user) return NOT_FOUND_RESULT;
    if (typeof user.nickname !== 'string' || user.nickname.trim() !== nickname) return NOT_FOUND_RESULT;
    if (!user.birth_date) return NOT_FOUND_RESULT;

    const storedBirthDate = new Date(user.birth_date);
    if (Number.isNaN(storedBirthDate.getTime()) || !sameUtcCalendarDay(storedBirthDate, birthDate)) {
        return NOT_FOUND_RESULT;
    }

    return { ok: true, maskedEmail: maskEmail(user.email) };
};

module.exports = { findId };
