'use strict';

// 이메일 주소 한 곳 검사 파일, 받는 사람 하나짜리 주소인지 엄격하게 봄 (여러 곳 보내기·머리말 끼워 넣기 막기)
// 가입 인증·비번 재설정·이메일 바꾸기·소셜 가입 입력 검사와 메일 발송기(mailSenders)가 같이 씀

// 메일 규칙상 전체 254자, @ 앞 64자, 도메인 한 칸 63자
const ADDRESS_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 63;

// @ 앞에 쓸 수 있는 글자: 영문·숫자·. _ % + - ' 만 (쉼표·세미콜론·꺾쇠·따옴표·괄호·빈칸·줄바꿈은 못 씀)
const LOCAL_PATTERN = /^[A-Za-z0-9._%+'-]+$/;
// 도메인 한 칸: 영문·숫자·- (앞뒤 - 금지), 끝 칸은 글자 2자 이상 (xn-- 꼴 국제 도메인도 됨)
const LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const TOP_LABEL_PATTERN = /^(?:[A-Za-z]{2,}|xn--[A-Za-z0-9-]+)$/;

// 받는 사람 하나짜리 주소인지 (앞뒤 빈칸도 안 받음, 다듬기는 부르는 쪽 몫)
// maxLength로 칸마다 더 짧게 자를 수 있음 (가입 칸 100자)
const isSingleEmailAddress = (value, { maxLength = ADDRESS_MAX_LENGTH } = {}) => {
    if (typeof value !== 'string') return false;
    if (value.length === 0 || value.length > Math.min(maxLength, ADDRESS_MAX_LENGTH)) return false;

    // @는 꼭 하나 (a@b@c, 쉼표로 이은 두 주소 막기)
    const parts = value.split('@');
    if (parts.length !== 2) return false;
    const [local, domain] = parts;

    if (!local || local.length > LOCAL_MAX_LENGTH || !LOCAL_PATTERN.test(local)) return false;
    // 점으로 시작·끝·두 개 잇달음 금지
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

    const labels = domain.split('.');
    if (labels.length < 2) return false;
    if (!labels.every((label) => label.length <= LABEL_MAX_LENGTH && LABEL_PATTERN.test(label))) return false;
    if (!TOP_LABEL_PATTERN.test(labels[labels.length - 1])) return false;

    return true;
};

module.exports = { ADDRESS_MAX_LENGTH, LOCAL_MAX_LENGTH, isSingleEmailAddress };
