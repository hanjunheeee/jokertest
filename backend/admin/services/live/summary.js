'use strict';

// 열린 방·판 서비스 파일, 기존 지금 상황 요약(/internal/live와 같은 길)을 그대로 불러 점검 상태를 붙임
// live.controller.js가 부름, Node 여러 개면 기존 RPC 합침(getClusterLiveSummary: node 칸·nodes·partial)
const cluster = require('../../../cluster');
const liveService = require('../../../services/ops/live');
const maintenanceService = require('../../../services/ops/maintenance');

// node 주면 그 Node 것만, 단일 모드는 이 Node 요약 (모양은 /internal/live와 같음)
const getLive = async ({ node } = {}) => {
    const summary = cluster.isEnabled()
        ? await liveService.getClusterLiveSummary({ node })
        : await liveService.getLiveSummary();
    return { ...summary, maintenance: maintenanceService.getMaintenanceState() };
};

module.exports = { getLive };
