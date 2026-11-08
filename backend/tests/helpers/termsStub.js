'use strict';

// 시험 도우미: 가입 약관 동의·만 14세 검사를 통과로 갈아끼움 (약관 표 없이 가입 흐름만 보는 시험용)
// 약관 검사 자체는 tests/audit-2026-11-09/member-약관.test.js가 봄
const termsService = require('../../services/auth/terms');

// t.after로 원래대로 되돌림, 기록된 동의 호출을 돌려줌
const passSignupTerms = (t) => {
    const recorded = [];
    const original = {
        checkSignupAgreements: termsService.checkSignupAgreements,
        recordAgreements: termsService.recordAgreements,
    };
    termsService.checkSignupAgreements = async () => [];
    termsService.recordAgreements = async (userId, versionIds) => { recorded.push({ userId, versionIds }); };
    t.after(() => Object.assign(termsService, original));
    return recorded;
};

// 파일 하나 통째로 통과 (node --test는 파일마다 따로 돌아 다른 파일에 안 번짐)
const passSignupTermsForFile = () => {
    termsService.checkSignupAgreements = async () => [];
    termsService.recordAgreements = async () => {};
};

module.exports = { passSignupTerms, passSignupTermsForFile };
