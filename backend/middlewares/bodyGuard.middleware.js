'use strict';

// 요청 본문 앞단 파일, 본문 크기 제한·읽기 실패 고정 응답 · 프로토타입 바꾸는 키(__proto__ 등) 거절
// index.js가 라우터 앞에 차례대로 붙임 (보안 시험 도우미도 같은 것 붙임)
const express = require('express');

// 본문 최대 크기 (API는 짧은 JSON뿐, 큰 본문으로 메모리·CPU 쓰게 하기 막기)
const BODY_LIMIT = '100kb';
// 객체 기본 모양을 바꿀 수 있는 키 (프로토타입 오염 막기)
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// 이보다 깊게 겹친 본문은 거절 (깊은 재귀로 스택 쓰게 하기 막기)
const MAX_DEPTH = 32;

// 본문 안 어디든 금지 키가 있거나 너무 깊은지
const hasForbiddenKey = (value, depth = 0) => {
    if (value === null || typeof value !== 'object') return false;
    if (depth > MAX_DEPTH) return true;
    if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1));
    return Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(value[key], depth + 1));
};

// 본문 읽기 실패(깨진 JSON·너무 큼·모르는 글자셋): 내부 문구(본문 조각·라이브러리 이름) 없이 코드만
const bodyParseErrorHandler = (err, req, res, next) => {
    if (!err || typeof err.type !== 'string' || !(err.status >= 400 && err.status < 500)) return next(err);
    if (err.status === 413) return res.status(413).json({ ok: false, code: 'PAYLOAD_TOO_LARGE' });
    const status = err.status === 415 ? 415 : 400;
    return res.status(status).json({ ok: false, code: 'INVALID_INPUT' });
};

// 본문·쿼리에 금지 키 있으면 400 (서비스까지 안 감)
const rejectForbiddenKeys = (req, res, next) => {
    if (hasForbiddenKey(req.body) || hasForbiddenKey(req.query)) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }
    return next();
};

// 붙일 차례: JSON → 폼(겹친 키 안 풂) → 읽기 실패 응답 → 금지 키 거절
const bodyGuards = () => [
    express.json({ limit: BODY_LIMIT }),
    express.urlencoded({ extended: false, limit: BODY_LIMIT }),
    bodyParseErrorHandler,
    rejectForbiddenKeys,
];

module.exports = { BODY_LIMIT, FORBIDDEN_KEYS, MAX_DEPTH, hasForbiddenKey, bodyParseErrorHandler, rejectForbiddenKeys, bodyGuards };
