'use strict';

// 비밀번호 재설정 시험 손잡이 파일
// 입구가 __testables로 내보냄, 지금 부르는 시험 없음
const { buildResetUrl, hashToken, generateRawToken } = require('./tokens');
const { isDeadlock } = require('./retry');

// 시험용: 주소 만들기·해시·토큰 만들기·데드락 판정
exports.__testables = { buildResetUrl, hashToken, generateRawToken, isDeadlock };
