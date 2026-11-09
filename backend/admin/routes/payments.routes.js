'use strict';

// 결제·환불 경로 파일, /admin-api/payments 아래 (주문 찾기 · 주문 하나 · 환불)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');
const controller = require('../controllers/payments.controller');

const router = express.Router();

router.get('/orders', controller.list);
router.get('/orders/:orderId', controller.detail);
router.post('/orders/:orderId/refund', controller.refund);

module.exports = router;
