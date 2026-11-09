'use strict';

// DB 질의 로그 설정 파일, sequelize가 질의마다 찍을지 고름
// models/index.js가 Sequelize 만들 때 부름

// 운영은 늘 끔, 개발·시험은 DB_LOG_QUERIES=1일 때만 console.log로 찍음
// 끄는 까닭: 질의마다 찍기가 부하 시험 50판에서 CPU 약 8% + 로그 줄 1초 600개 (부하시험.md 8번)
const pickQueryLogging = (nodeEnv = process.env.NODE_ENV, env = process.env) => {
    if (nodeEnv === 'production') return false;
    return String(env.DB_LOG_QUERIES ?? '').trim() === '1' ? console.log : false;
};

module.exports = { pickQueryLogging };
