'use strict';

// 약관 경로 파일, /admin-api/terms 아래 GET /(버전 목록) · POST /(새 버전)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/terms.controller');

const router = express.Router();

router.get('/', controller.listTerms);
router.post('/', controller.createTerms);

module.exports = router;
