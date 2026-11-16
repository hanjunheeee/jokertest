'use strict';

// 비밀번호 재설정 상수 파일, 토큰 유효 시간 · 다시 보내기 기다림 · 데드락 재시도 수
// 같은 폴더 request.js·retry.js·index.js가 씀, 유효 시간은 load 때 환경변수 한 번 읽음

// 재설정 토큰 유효 시간 (환경변수 없거나 틀리면 30분)
const TOKEN_TTL_MS = (() => {
    const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
})();

// 같은 계정 다시 요청은 앞 메일에서 1분 지나야 새로 보냄 (늦게 온 앞 메일 링크가 바로 죽는 것 막기, 화면도 1분 단추 끔)
const RESEND_WAIT_MS = 60 * 1000;

// 데드락이면 이만큼까지 다시 (끝없이 돌지 않게)
const DEADLOCK_MAX_RETRIES = 2;

exports.TOKEN_TTL_MS = TOKEN_TTL_MS;

exports.RESEND_WAIT_MS = RESEND_WAIT_MS;

exports.DEADLOCK_MAX_RETRIES = DEADLOCK_MAX_RETRIES;
