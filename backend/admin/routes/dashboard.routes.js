'use strict';

// 운영 현황 경로 파일, GET /admin-api/dashboard (첫 화면 숫자)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const { getDashboard } = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/', getDashboard);

module.exports = router;
