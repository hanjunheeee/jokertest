'use strict';

// 처리 이력 경로 파일, /admin-api/audit-logs(이력 목록) 와 거르기용 /admin-api/admins(관리자 목록) 둘 다 이 파일
// admin/index.js가 붙임 (로그인·쓰기 확인은 앞에서), 기록 고치기·지우기 경로는 일부러 없음 → 404
const express = require('express');

const controller = require('../controllers/auditLogs.controller');

// /admin-api/audit-logs
const router = express.Router();
router.get('/', controller.list);

// /admin-api/admins (관리자 목록, 이력 거르기용)
const adminsRouter = express.Router();
adminsRouter.get('/', controller.admins);

module.exports = router;
module.exports.adminsRouter = adminsRouter;
