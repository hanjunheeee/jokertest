'use strict';

// 약관 동의 파일, 가입 때 동의·만 14세 검사 + 기록 · 로그인 뒤 재동의 필요 목록·재동의
// 가입 서비스 둘(account/signup.js·social/signup.js)·약관 컨트롤러가 약관 입구로 부름
const termsRepository = require('../../../repositories/auth/terms');
const { createError } = require('../../../utils/appError');
const { isOldEnoughToSignup, normalizeAgreedIds, MIN_SIGNUP_AGE } = require('../../../validations/auth/terms');
const { getCurrentTerms } = require('./current');

// 가입 검사: 만 14세 확인 체크 → 생일로 14세 미만 거절 → 지금 필수 약관 전부 동의했나
// 통과하면 기록할 약관 id 목록 (지금 버전 중 동의한 것만)
const checkSignupAgreements = async ({ agreedTermsVersionIds, ageConfirmed, birthDate }, { now = new Date(), transaction } = {}) => {
    if (ageConfirmed !== true) {
        throw createError(`만 ${MIN_SIGNUP_AGE}세 이상인지 확인해주세요.`, 400, 'AGE_CONFIRM_REQUIRED');
    }
    if (!isOldEnoughToSignup(birthDate, now)) {
        throw createError(`만 ${MIN_SIGNUP_AGE}세 미만은 가입할 수 없습니다.`, 400, 'AGE_UNDER_14');
    }
    const agreed = normalizeAgreedIds(agreedTermsVersionIds) ?? [];
    const current = await getCurrentTerms({ now, transaction });
    // 필수 약관 하나라도 빠지면 거절 (화면이 옛 버전을 들고 있어도 여기서 걸림)
    const missing = current.filter((terms) => terms.required && !agreed.includes(terms.id));
    if (missing.length > 0) {
        throw createError('필수 약관에 동의해주세요.', 400, 'TERMS_AGREEMENT_REQUIRED');
    }
    return current.filter((terms) => agreed.includes(terms.id)).map((terms) => terms.id);
};

// 동의 기록 (가입 트랜잭션 안에서 부름, 빈 목록이면 안 씀)
const recordAgreements = async (userId, versionIds, { now = new Date(), transaction } = {}) => {
    if (!Array.isArray(versionIds) || versionIds.length === 0) return;
    await termsRepository.createAgreements(userId, versionIds, now, { transaction });
};

// 재동의 필요 목록: 지금 필수 약관 중 아직 동의 안 한 것
const getPendingTerms = async (userId, { now = new Date() } = {}) => {
    const current = await getCurrentTerms({ now });
    const agreed = new Set(await termsRepository.findAgreedVersionIds(userId));
    return current.filter((terms) => terms.required && !agreed.has(terms.id));
};

// 재동의: 지금 버전 id만 받음 (옛 버전·없는 id면 거절) → 기록 → 남은 필요 목록
const agreeToTerms = async (userId, agreedTermsVersionIds, { now = new Date() } = {}) => {
    const agreed = normalizeAgreedIds(agreedTermsVersionIds);
    if (!agreed || agreed.length === 0) {
        throw createError('동의할 약관을 골라주세요.', 400, 'TERMS_AGREEMENT_REQUIRED');
    }
    const currentIds = new Set((await getCurrentTerms({ now })).map((terms) => terms.id));
    if (agreed.some((id) => !currentIds.has(id))) {
        throw createError('약관이 바뀌었습니다. 새로 고친 뒤 다시 동의해주세요.', 409, 'TERMS_VERSION_OUTDATED');
    }
    await termsRepository.createAgreements(userId, agreed, now);
    return { pending: await getPendingTerms(userId, { now }) };
};

module.exports = {
    checkSignupAgreements,
    recordAgreements,
    getPendingTerms,
    agreeToTerms,
};
