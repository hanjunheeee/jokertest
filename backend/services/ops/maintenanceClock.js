'use strict';

// 점검 시계 파일, 점검 시작 시각에 이 Node 진행 판·대기방을 끝내고 큰 안내(active) 보냄 + 다시 읽을 때마다 안내 보내기
// socket/socket.js가 initSocket 때 startMaintenanceClock으로 켬, Node마다 자기 시계로 자기 판만 (판·방은 만든 Node 메모리에만 있어서)
const maintenance = require('./maintenance');
const maintenanceNotice = require('./maintenanceNotice');
const cluster = require('../../cluster');
const { getIo } = require('../../socket/emitter');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');
const { closeRoomsForMaintenance } = require('../../socket/matchmaking/room/maintenanceClose');

// setTimeout 최대 (약 24일), 넘으면 그만큼 기다렸다 다시 맞춤
const MAX_TIMER_MS = 2 ** 31 - 1;

// 이 Node 진행 판 전부 무효로 끝내고 대기방 전부 닫음 → { games, rooms } (한쪽이 던져도 다른 쪽은 함)
const abortAllForMaintenance = (io, message) => {
    let games = 0;
    let rooms = 0;
    try {
        games = abortGamesForMaintenance(io);
    } catch (error) {
        console.error('[점검 판 끝내기 실패]', error?.name ?? 'Error');
    }
    try {
        rooms = closeRoomsForMaintenance(io, message);
    } catch (error) {
        console.error('[점검 대기방 닫기 실패]', error?.name ?? 'Error');
    }
    return { games, rooms };
};

// 시작 시각 큰 안내: 지금 상태 그대로 이 Node 접속자에게 (이미 보낸 안내면 안 감)
const defaultSendActive = (io) => maintenanceNotice.broadcastState(io, maintenance.getMaintenanceState());

// 시계 하나 만들기 (시험은 가짜 타이머·가짜 끝내기를 넣어 Node 둘도 만듦)
function createMaintenanceClock({
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    nowFn = Date.now,
    getIo: readIo = getIo,
    abortAll = abortAllForMaintenance,
    sendActive = defaultSendActive,
    nodeId = () => cluster.serverId(),
} = {}) {
    let timer = null;
    // 이미 끝낸 시작 시각 (60초 안전망으로 같은 상태 다시 읽어도 두 번 안 끝내게)
    let firedFor = null;
    const forceEndListeners = new Set();

    const clearTimer = () => {
        if (timer !== null) clearTimeoutFn(timer);
        timer = null;
    };

    // 강제 종료 결과 알림 (하나 던져도 나머지는 받음)
    const notifyForceEnd = (report) => {
        for (const listener of forceEndListeners) {
            try {
                listener(report);
            } catch (error) {
                console.error('[점검 강제 종료 알림 실패]', error?.name ?? 'Error');
            }
        }
    };

    // 시작 시각이 됨: 큰 안내 → 판·방 끝내기 → Node 결과 알림 (io 없으면 다음 맞추기 때 다시)
    const fire = (state) => {
        timer = null;
        const io = readIo();
        if (!io) return;
        firedFor = state.startsAt;
        sendActive(io, state);
        const { games, rooms } = abortAll(io, state.message);
        notifyForceEnd({ node: nodeId(), games, rooms, startsAt: state.startsAt });
    };

    // 다시 읽을 때마다: 타이머 지우고 다시 검 (켜짐 + 시작 시각 → 그 시각에, 지났으면 바로 / 아니면 안 걺)
    const sync = (state, now = nowFn()) => {
        clearTimer();
        if (!state?.enabled || !state.startsAt) {
            firedFor = null;
            return false;
        }
        if (firedFor === state.startsAt) return false;
        const waitMs = Math.max(0, Date.parse(state.startsAt) - now);
        if (waitMs > MAX_TIMER_MS) {
            timer = setTimeoutFn(() => sync(state), MAX_TIMER_MS);
        } else {
            timer = setTimeoutFn(() => fire(state), waitMs);
        }
        timer?.unref?.();
        return true;
    };

    return {
        sync,
        stop: clearTimer,
        notifyForceEnd,
        // 강제 종료 결과 받기 (관리자 기록 MAINTENANCE_FORCE_END) → 끄는 함수
        onForceEnd: (listener) => {
            forceEndListeners.add(listener);
            return () => forceEndListeners.delete(listener);
        },
    };
}

// 이 Node 시계 하나
const clock = createMaintenanceClock();
let started = false;

// 켜기 (여러 번 불러도 한 번): 점검 다시 읽을 때마다 타이머 맞추고, 바뀐 안내는 이 Node 접속자에게
const startMaintenanceClock = () => {
    if (started) return;
    started = true;
    maintenance.onMaintenanceChange((current) => {
        clock.sync(current);
        maintenanceNotice.broadcastState(getIo(), current);
    });
    // 켜기 전에 이미 읽어 둔 상태도 맞춤
    clock.sync(maintenance.getMaintenanceState());
};

module.exports = {
    createMaintenanceClock,
    abortAllForMaintenance,
    startMaintenanceClock,
    clock,
    onForceEnd: clock.onForceEnd,
};
