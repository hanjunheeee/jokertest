'use strict';

// 관리자 로그인 경로 파일, /admin-api/auth 아래 login·me·logout
// admin/index.js가 로그인 확인 앞에 붙임 → me는 여기서 세션 확인, 로그인은 IP 1분 10번 제한·Origin 확인
const express = require('express');

const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const { getClientIp } = require('../../utils/request');
const { requireAdminSession } = require('../middlewares/adminSession.middleware');
const { requireAdminOrigin } = require('../middlewares/csrf.middleware');
const controller = require('../controllers/auth.controller');

// 로그인 IP마다 1분 10번 (DB 잠깐 막기 앞에서 마구 두드리기 막음)
const loginRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    name: 'admin-login',
    keyOf: (req) => `ip:${getClientIp(req)}`,
    message: '로그인 요청이 너무 많아요. 잠시 뒤 다시 해 주세요.',
});

const router = express.Router();

router.post('/login', loginRateLimit, requireAdminOrigin, controller.login);
router.get('/me', requireAdminSession, controller.me);
// 로그아웃은 세션이 끝났어도 쿠키를 지워야 해서 세션 확인 없이 Origin만
router.post('/logout', requireAdminOrigin, controller.logout);

module.exports = router;
