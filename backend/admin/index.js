'use strict';

// 관리자 서버 조립 파일, /admin-api 순서: 꺼짐 → 저장 금지 → Access → 요청 수 → /auth → 로그인 → 쓰기 확인 → 영역들 → 오류
// backend/index.js가 /admin-api에 붙임, 영역 라우터는 admin/routes/<영역>.routes.js (각 단위가 채움)
const express = require('express');

const { createRateLimiter } = require('../middlewares/rateLimit.middleware');
const { getClientIp } = require('../utils/request');
const { requireAccess } = require('./middlewares/access.middleware');
const { requireAdminSession } = require('./middlewares/adminSession.middleware');
const { requireCsrf } = require('./middlewares/csrf.middleware');
const { adminErrorHandler } = require('./middlewares/adminError.middleware');

// 붙이는 자리 표 (경계.md 0-1): 경로 → 라우터 파일, pick은 파일이 둘 내보낼 때 고를 이름
// 더 긴 경로를 먼저 (members/:uuid/wallet → members/:uuid → members)
const AUTH_MOUNT = Object.freeze({ path: '/auth', file: 'auth' });
const AREA_MOUNTS = Object.freeze([
    { path: '/dashboard', file: 'dashboard' },
    { path: '/members/:uuid/wallet', file: 'wallet' },
    { path: '/members/:uuid', file: 'sanctions' },
    { path: '/members', file: 'members' },
    { path: '/announcements', file: 'announcements' },
    { path: '/audit-logs', file: 'auditLogs' },
    { path: '/admins', file: 'auditLogs', pick: 'adminsRouter' },
    { path: '/reports', file: 'reports' },
    { path: '/maintenance', file: 'maintenance' },
    { path: '/banned-words', file: 'bannedWords' },
    { path: '/payments', file: 'payments' },
    { path: '/products', file: 'products' },
    { path: '/coupons', file: 'coupons' },
    { path: '/stats', file: 'stats' },
    { path: '/games', file: 'games' },
    { path: '/terms', file: 'terms' },
    { path: '/live', file: 'live' },
    { path: '/inquiries', file: 'inquiries' },
]);
const MOUNTS = Object.freeze([AUTH_MOUNT, ...AREA_MOUNTS]);

const TOTP_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

// OTP 잠금 열쇠가 없거나 모양이 틀리면 관리자 페이지 전체 꺼짐 (요청 때마다 봄 → 시험·재설정 바로 반영)
// 운영은 클라우드플레어 팀·AUD 값까지 있어야 켬 (문 1 확인 못 하는 채로 열리지 않게)
const isAdminEnabled = (env = process.env) => TOTP_KEY_PATTERN.test(String(env.ADMIN_TOTP_KEY ?? ''))
    && require('./config').isProductionAccessReady(env);

// 꺼짐이면 이 라우터를 건너뜀 → 뒤 404 처리기 (없는 경로와 같은 모양이라 있는지도 안 드러남)
const skipWhenDisabled = (req, res, next) => (isAdminEnabled() ? next() : next('router'));

// 관리자 응답은 브라우저·프록시가 저장 못 하게
const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
};

// /admin-api 전체 IP마다 1분 300번 (로그인 1분 10번은 auth 라우터 몫)
const adminRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    name: 'admin-api',
    keyOf: (req) => `ip:${getClientIp(req)}`,
    message: '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.',
});

// 파일에서 라우터 꺼내기 (pick 있으면 그 이름)
const loadRouter = ({ file, pick }) => {
    const exported = require(`./routes/${file}.routes`);
    return pick ? exported[pick] : exported;
};

const router = express.Router();
router.use(skipWhenDisabled, noStore, requireAccess, adminRateLimit);
router.use(AUTH_MOUNT.path, loadRouter(AUTH_MOUNT));
router.use(requireAdminSession, requireCsrf);
for (const mount of AREA_MOUNTS) router.use(mount.path, loadRouter(mount));
router.use(adminErrorHandler);

module.exports = router;
module.exports.MOUNTS = MOUNTS;
module.exports.isAdminEnabled = isAdminEnabled;
