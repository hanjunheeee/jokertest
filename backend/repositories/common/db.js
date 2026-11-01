// db 창구 파일, models 묶음(db 객체)을 그대로 다시 내보냄
// 서비스들이 models 대신 이걸로 db를 받음 (같은 객체라 시험이 바꿔 끼운 것도 보임)
module.exports = require('../../models')
