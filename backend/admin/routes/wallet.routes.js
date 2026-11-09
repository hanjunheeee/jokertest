'use strict';

// 골드·다이아 주고 뺏기 경로 파일, /admin-api/members/:uuid/wallet 아래 (지갑 보기 · 주고 뺏기)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');
const controller = require('../controllers/wallet.controller');

// uuid를 받으려고 mergeParams
const router = express.Router({ mergeParams: true });

router.get('/', controller.get);
router.post('/adjust', controller.adjust);

module.exports = router;
