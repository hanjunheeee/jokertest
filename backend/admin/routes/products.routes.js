'use strict';

// 상품 경로 파일, /admin-api/products 아래 (목록 · 만들기 · 고치기)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');
const controller = require('../controllers/products.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:productId', controller.update);

module.exports = router;
