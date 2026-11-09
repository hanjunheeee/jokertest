'use strict';

// 관리자 환경값 읽기 파일, ADMIN_* 값을 한 곳에서 읽고 모양 검사 (값 자체는 어디에도 안 찍음)
// 관리자 미들웨어·인증 서비스·계정 명령·admin/index.js 꺼짐 판단이 씀, 요청 때마다 읽어 시험·재설정이 바로 반영됨

const TOTP_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const CLOUDFLARE_SUFFIX = '.cloudflareaccess.com';
const DEFAULT_IDLE_MIN = 30;
// 자동 로그아웃 분 위 한도 (로그인 최대 12시간과 같음)
const MAX_IDLE_MIN = 12 * 60;
const MINUTE_MS = 60 * 1000;
const SESSION_MAX_MS = 12 * 60 * MINUTE_MS;

const clean = (value) => String(value ?? '').trim();
const isProduction = (env = process.env) => env.NODE_ENV === 'production';

// 개발·시험에서만 Access 끄기 (운영이면 off 값 무시 → 설정 실수로 문이 안 열림)
const isAccessOff = (env = process.env) => clean(env.ADMIN_ACCESS_MODE) === 'off' && !isProduction(env);

// 팀 이름 → 팀 주소 (예: "myteam" → "myteam.cloudflareaccess.com", 주소 통째로 넣어도 됨)
const teamDomainOf = (env) => {
    const raw = clean(env.ADMIN_ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    if (!raw) return null;
    return raw.includes('.') ? raw : `${raw}${CLOUDFLARE_SUFFIX}`;
};

// Access 표 확인 값: 발급자·AUD·공개키 주소, 팀·AUD 없으면 null
// 시험용 공개키 주소(ADMIN_ACCESS_CERTS_URL)는 운영에서 무시
const accessSettings = (env = process.env) => {
    const team = teamDomainOf(env);
    const aud = clean(env.ADMIN_ACCESS_AUD);
    if (!team || !aud) return null;
    const testCertsUrl = isProduction(env) ? '' : clean(env.ADMIN_ACCESS_CERTS_URL);
    return {
        issuer: `https://${team}`,
        aud,
        certsUrl: testCertsUrl || `https://${team}/cdn-cgi/access/certs`,
    };
};

// 운영은 팀·AUD 둘 다 있어야 관리자 페이지 켬 (개발·시험은 상관없음)
const isProductionAccessReady = (env = process.env) => !isProduction(env) || accessSettings(env) !== null;

// OTP 비밀 잠금 열쇠 (16진수 64자 → 32바이트), 모양 틀리면 null
const totpKeyOf = (env = process.env) => {
    const raw = clean(env.ADMIN_TOTP_KEY);
    return TOTP_KEY_PATTERN.test(raw) ? Buffer.from(raw, 'hex') : null;
};

// 관리자 화면 주소 (끝 / 뺌), 없으면 null → 쓰기 전부 막힘
const adminOriginOf = (env = process.env) => clean(env.ADMIN_ORIGIN).replace(/\/+$/, '') || null;

// 가만히 있으면 끊는 시간 (ms), 이상한 값이면 30분
const sessionIdleMs = (env = process.env) => {
    const minutes = Number(clean(env.ADMIN_SESSION_IDLE_MIN));
    const valid = Number.isInteger(minutes) && minutes > 0 && minutes <= MAX_IDLE_MIN;
    return (valid ? minutes : DEFAULT_IDLE_MIN) * MINUTE_MS;
};

module.exports = {
    TOTP_KEY_PATTERN,
    SESSION_MAX_MS,
    isProduction,
    isAccessOff,
    accessSettings,
    isProductionAccessReady,
    totpKeyOf,
    adminOriginOf,
    sessionIdleMs,
};
