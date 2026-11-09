'use strict';

// 골드·다이아 주고 뺏기 경로 빈 자리, /admin-api/members/:uuid/wallet 아래 경로를 여기 적기
// admin/index.js가 붙임, 2-8 단위가 채움 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

// uuid를 받으려고 mergeParams
const router = express.Router({ mergeParams: true });

module.exports = router;
