// db 손잡이 창구 파일, models 묶음을 그대로 내보냄
// 서비스가 models를 직접 안 부르게 이 파일로 받음 (같은 객체라 시험 갈아끼우기 그대로 먹음)
module.exports = require('../../models')
