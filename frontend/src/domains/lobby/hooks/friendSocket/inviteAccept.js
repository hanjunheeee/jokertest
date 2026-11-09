// 게임 초대 수락 흐름 (수락 요청 → 다른 Node 방이면 옮겨 한 번 다시 → 결과 모르면 다시 묻기 → 지금 방 확인 → 방 화면으로 이동)
// 소켓 훅 입구(useFriendSocketEvents)가 다시 내보내 패널 초대 훅·시험이 씀, 이동 함수 등록도 그 훅이 함
import { useGameInviteStore } from "../../store/gameInvite.store.js";
import { getSocket } from "../../../../shared/socket/socketClient.js";
import { moveToNode, nodeToMoveTo } from "../../../../shared/socket/nodeMove.js";
import { NODE_ERROR_CODES, NODE_MOVE_MESSAGES } from "../../../../shared/constants/connectionSocket.js";
import { useMatchingStore } from "../../../game/matching/store/matchingStore.js";
import { useInGameStore } from "../../../game/ingame/store/ingameStore.js";
import {
    emitAcceptInvite,
    emitCurrentRoom,
    emitInviteResult,
    isSameConnection,
} from "../../socket/gameInvite.socket.js";
import {
    INVITE_ACCEPT_TIMEOUT_MS,
    INVITE_RESULT_MAX_TRIES,
    INVITE_RESULT_RETRY_DELAY_MS,
    INVITE_VERIFY_TIMEOUT_MS,
} from "../../constants/gameInvite.js";
import { canEnterRoom } from "../../utils/gameInvite/inviteState.js";
import { loadInviteSnapshotAndPlayNew } from "./inviteSfx.js";

// 앱 라우터 이동 함수 (훅이 넣어 주고, 없으면 이동 안 함)
let navigateToApp = null;

// 이동 함수 읽기·넣기 (소켓 훅이 넣고 뺌)
export const getNavigate = () => navigateToApp;
export const setNavigate = (next) => { navigateToApp = next; };

// 실패를 초대 오류로 남기고, 목록이 실제와 달라졌을 수 있어 스냅샷을 다시 받음
const failWith = (inviteId, message) => {
    useGameInviteStore.getState().setInviteError(inviteId, message);
    loadInviteSnapshotAndPlayNew();
};

// 수락 결과 다시 묻기, "처리 중"이면 기다렸다 몇 번 더, 끝내 모르면 null
async function askResultAgain(socket, inviteId, canAskAgain) {
    let recovered = await emitInviteResult(socket, inviteId, INVITE_VERIFY_TIMEOUT_MS);
    for (let tries = 1; recovered?.ok === true && recovered.pending === true && tries < INVITE_RESULT_MAX_TRIES; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, INVITE_RESULT_RETRY_DELAY_MS));
        if (!canAskAgain()) break;
        recovered = await emitInviteResult(socket, inviteId, INVITE_VERIFY_TIMEOUT_MS);
    }
    if (recovered?.ok !== true || recovered.pending === true) return null;
    if (recovered.entered === true && recovered.room) return { ok: true, room: recovered.room, inviteId, recovered: true };
    return { ok: false, code: "NOT_ENTERED", message: "방에 입장하지 못했습니다." };
}

// 다른 Node 방이라는 거절이면 그 Node로 옮겨 한 번만 다시 수락 (서버는 DB를 안 건드리고 거절해서 다시 보내도 됨)
// 돌려줌: { result, connectionId } — connectionId는 옮긴 뒤 새 연결 id (안 옮겼으면 undefined)
// 옮기기 실패면 NODE_UNAVAILABLE, 그사이 소켓이 바뀌면 결과 모름
async function acceptOnOwnerNode(socket, inviteId, firstResult) {
    const node = nodeToMoveTo(firstResult);
    if (!node) return { result: firstResult, connectionId: undefined };
    try {
        await moveToNode(node);
    } catch {
        const code = NODE_ERROR_CODES.NODE_UNAVAILABLE;
        return { result: { ok: false, code, message: NODE_MOVE_MESSAGES[code] }, connectionId: null };
    }
    if (socket !== getSocket()) return { result: { ok: false, code: "STALE_CONNECTION", unknown: true }, connectionId: null };
    const connectionId = socket.id ?? null;
    return { result: await emitAcceptInvite(socket, inviteId, INVITE_ACCEPT_TIMEOUT_MS), connectionId };
}

// 수락 보내기 → 다른 Node 방이면 옮겨 한 번 다시 → 응답 못 받았으면 결과 다시 묻기
// 돌려줌: { result, connectionId } — connectionId는 옮겼으면 옮긴 뒤 새 연결 id, 아니면 받은 그대로
async function acceptWithRecovery(socket, inviteId, connectionId, accountGeneration) {
    const first = await emitAcceptInvite(socket, inviteId, INVITE_ACCEPT_TIMEOUT_MS);
    const accepted = await acceptOnOwnerNode(socket, inviteId, first);
    let result = accepted.result;
    // 옮겼으면 연결 id가 바뀜 → 옮긴 뒤 새 연결 기준으로 봄
    if (accepted.connectionId !== undefined) connectionId = accepted.connectionId;

    // 응답을 못 받았으면 같은 연결·같은 계정일 때만 결과를 다시 물음, "처리 중"이면 기다렸다 몇 번 더
    const canAskAgain = () => isSameConnection(socket, connectionId)
        && useGameInviteStore.getState().isCurrent(accountGeneration);
    if (result?.unknown === true && canAskAgain()) {
        result = await askResultAgain(socket, inviteId, canAskAgain) ?? result;
    }
    return { result, connectionId };
}

// 입장한 방 확인 뒤 들어가기: 그사이 재접속했거나 서버가 말하는 지금 방이 다르면 오류만 남김
async function enterVerifiedRoom(socket, inviteId, result, connectionId, accountGeneration) {
    // 그사이 재접속했으면 이 연결의 입장 결과를 믿지 않음
    if (!isSameConnection(socket, connectionId)) {
        failWith(inviteId, "연결이 바뀌어 입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.");
        return { ok: false, code: "STALE_CONNECTION", unknown: true };
    }

    // 서버가 말하는 지금 방이 수락한 방과 같을 때만 들어감
    const currentRoom = await emitCurrentRoom(socket, INVITE_VERIFY_TIMEOUT_MS);
    const verifiedRoom = currentRoom?.ok === true ? currentRoom.room : null;
    if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };
    if (!isSameConnection(socket, connectionId)
        || verifiedRoom === null || typeof verifiedRoom !== "object"
        || verifiedRoom.roomId !== result.room.roomId) {
        failWith(inviteId, "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.");
        return { ok: false, code: "ROOM_NOT_CONFIRMED", unknown: true };
    }

    // 확인 끝: 옛 인게임 상태 비우고 방 넣고 대기실로 이동
    useInGameStore.getState().clearGame();
    useMatchingStore.getState().setRoom(verifiedRoom);
    navigateToApp?.("/game-matching");
    return { ...result, room: verifiedRoom };
}

// 수락 요청 하나를 끝까지 처리함, 끝나면 수락 잠금은 같은 작업 번호로만 풂
export async function requestGameInviteAccept(inviteId) {
    // 초대 id가 없으면 거절
    if (typeof inviteId !== "string" || inviteId.length === 0) return { ok: false, code: "INVALID_REQUEST" };

    // 계정 맞추기, 같은 초대 수락이 이미 진행 중이면 거절
    const accountGeneration = useGameInviteStore.getState().syncAccount();
    const store = useGameInviteStore.getState();
    if (store.pendingInviteIds.has(inviteId)) return { ok: false, code: "IN_PROGRESS" };

    // 연결이 없으면 오류만 남김
    const socket = getSocket();
    if (!socket) {
        store.setInviteError(inviteId, "연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return { ok: false, code: "NO_SOCKET" };
    }

    // 지금 연결 id·작업 번호 기억하고 잠금, 그 초대 옛 오류 지움
    let connectionId = socket.id ?? null;
    const operationId = store.beginAcceptOperation();
    store.markAcceptPending(inviteId, true, operationId);
    store.setInviteError(inviteId, null);

    try {
        const accepted = await acceptWithRecovery(socket, inviteId, connectionId, accountGeneration);
        const result = accepted.result;
        connectionId = accepted.connectionId;

        // 그사이 계정이 바뀌었으면 버림
        if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };

        // 입장 못 했으면 오류 남기고 스냅샷 다시 받음
        if (!canEnterRoom(result)) {
            failWith(
                inviteId,
                result?.unknown === true
                    ? "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요."
                    : (result?.message ?? "초대를 수락하지 못했습니다."),
            );
            return result ?? { ok: false, code: "UNKNOWN" };
        }

        return await enterVerifiedRoom(socket, inviteId, result, connectionId, accountGeneration);
    } finally {
        // 성공·실패 모두 이 작업 번호의 잠금만 풂
        useGameInviteStore.getState().markAcceptPending(inviteId, false, operationId);
    }
}
