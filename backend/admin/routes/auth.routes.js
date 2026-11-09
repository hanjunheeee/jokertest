'use strict';

// 관리자 로그인 경로 빈 자리, /admin-api/auth 아래 경로를 여기 적기
// admin/index.js가 붙임, 0-2 단위가 채움
const express = require('express');

// 로그인 확인 앞에 붙음 → me·logout은 이 안에서 세션 확인을 붙임
const router = express.Router();

module.exports = router;
