'use strict';

// 비밀번호 재설정 시험 손잡이 파일
// 시험이 주소 만들기·해시·데드락 판정을 바로 부름
const { buildResetUrl, hashToken, generateRawToken } = require('./tokens');
const { isDeadlock } = require('./retry');

// 시험용: 안쪽 함수
exports.__testables = { buildResetUrl, hashToken, generateRawToken, isDeadlock };
