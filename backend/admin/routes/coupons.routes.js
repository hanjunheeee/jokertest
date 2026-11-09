'use strict';

// 쿠폰 경로 파일, /admin-api/coupons 아래 (목록 · 만들기 · 켜고 끄기 · 쓴 사람)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');
const controller = require('../controllers/coupons.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.toggle);
router.get('/:id/redemptions', controller.redemptions);

module.exports = router;
