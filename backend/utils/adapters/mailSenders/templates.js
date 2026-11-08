'use strict';

// 메일 문구 파일, 목적 5종 제목·본문 + 보내기 전 공통 확인(목적·받는 주소·기다리는 시간)
// 메일 발송기 셋(gateway·smtp·memory)과 adapters/mail.js가 씀

const { isSingleEmailAddress } = require('../../auth/emailAddress');

// 메일 제목 앞 게임 이름 (데스크톱·모바일 화면 이름과 같게)
const GAME_NAME = '가면무도회 살인사건';

// 보낼 수 있는 메일 목적 (비번 재설정 링크 · 소셜 전용 계정 안내 · 가입 인증번호 · 이메일 바꾸기 인증번호 · 이메일 바뀜 알림)
const TEMPLATES = new Set(['PASSWORD_RESET', 'SOCIAL_LOGIN_GUIDE', 'SIGNUP_CODE', 'EMAIL_CHANGE_CODE', 'EMAIL_CHANGED']);

// 목적마다 제목·본문 만들기, 모르는 목적이면 던짐
const renderTemplate = (template, params = {}) => {
    if (template === 'PASSWORD_RESET') {
        return {
            subject: `[${GAME_NAME}] 비밀번호 재설정 안내`,
            text: `비밀번호를 재설정하려면 아래 링크를 열어주세요.\n\n${params.resetUrl}\n\n`
                + '본인이 요청하지 않았다면 이 메일을 무시해주세요. 이 링크는 일정 시간이 지나면 만료됩니다.',
        };
    }
    if (template === 'SOCIAL_LOGIN_GUIDE') {
        return {
            subject: `[${GAME_NAME}] 계정 안내`,
            text: '이 이메일로 가입된 계정은 소셜 로그인 전용이라 비밀번호가 없습니다. '
                + '로그인 화면에서 사용하셨던 소셜 로그인으로 진행해주세요.',
        };
    }
    if (template === 'SIGNUP_CODE') {
        // 남은 분은 최소 1분으로 적음
        const minutes = Math.max(1, Math.floor((params.expiresInSec ?? 0) / 60));
        return {
            subject: `[${GAME_NAME}] 가입 인증번호`,
            text: `아래 인증번호를 입력해 이메일 인증을 완료해주세요.\n\n${params.code}\n\n`
                + `이 인증번호는 발급 후 ${minutes}분 이내에만 사용할 수 있습니다. `
                + '본인이 요청하지 않았다면 이 메일을 무시해주세요.',
        };
    }
    if (template === 'EMAIL_CHANGE_CODE') {
        const minutes = Math.max(1, Math.floor((params.expiresInSec ?? 0) / 60));
        return {
            subject: `[${GAME_NAME}] 이메일 변경 인증번호`,
            text: `계정 이메일을 이 주소로 바꾸려면 아래 인증번호를 입력해주세요.

${params.code}

`
                + `이 인증번호는 발급 후 ${minutes}분 이내에만 사용할 수 있습니다. `
                + '본인이 요청하지 않았다면 이 메일을 무시해주세요.',
        };
    }
    if (template === 'EMAIL_CHANGED') {
        // 새 주소는 가려서 적음 (옛 주소를 다른 사람이 볼 수도 있음)
        return {
            subject: `[${GAME_NAME}] 계정 이메일이 바뀌었습니다`,
            text: `계정 이메일이 ${params.maskedNewEmail ?? '새 주소'}(으)로 바뀌었습니다.

`
                + '본인이 바꾼 것이 아니라면 바로 고객센터로 알려주세요.',
        };
    }
    throw new Error('알 수 없는 메일 목적입니다.');
};

// 모르는 목적은 던지고, 문구 못 만들면 null (발송기가 { ok: false }로 끝냄)
const prepareMail = (template, params = {}) => {
    if (!TEMPLATES.has(template)) {
        throw new Error('알 수 없는 메일 목적입니다.');
    }
    try {
        return renderTemplate(template, params);
    } catch {
        return null;
    }
};

// 받는 주소: 받는 사람 하나짜리 주소만 (쉼표로 여러 곳 보내기·줄바꿈 머리말 끼워 넣기 막기)
const isMailAddress = (to) => isSingleEmailAddress(to);

// 기다리는 시간은 양의 정수일 때만, 아니면 기본값
const readTimeoutMs = (raw, fallback) => {
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// 설정 값이 비지 않은 글자인지 (앞뒤 빈칸 빼고)
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

module.exports = {
    GAME_NAME,
    TEMPLATES,
    renderTemplate,
    prepareMail,
    isMailAddress,
    readTimeoutMs,
    hasText,
};
