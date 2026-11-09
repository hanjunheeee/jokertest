'use strict';

// 처리 이력 경로 빈 자리, /admin-api/audit-logs 와 거르기용 /admin-api/admins 둘 다 이 파일
// admin/index.js가 붙임, 1-4 단위가 채움 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

// /admin-api/audit-logs
const router = express.Router();
// /admin-api/admins (관리자 목록, 이력 거르기용)
const adminsRouter = express.Router();

module.exports = router;
module.exports.adminsRouter = adminsRouter;
