// 게임 초대 수락 흐름 (수락 요청 → 결과 모르면 다시 묻기 → 지금 방 확인 → 방 화면으로 이동)
// 소켓 훅 입구(useFriendSocketEvents)가 다시 내보내 패널 초대 훅·시험이 씀, 이동 함수 등록도 그 훅이 함
import { useGameInviteStore } from "../../store/gameInvite.store.js";
import { getSocket } from "../../../../shared/socket/socketClient.js";
import { useMatchingStore } from "../../../game/matching/store/matchingStore.js";
import { useInGameStore } from "../../../game/ingame/store/ingameStore.js";
import {
    emitAcceptInvite,
    emitCurrentRoom,
    emitInviteResult,
    isSameConnection,
} from "../../socket/gameInvite.socket.js";
import { INVITE_ACCEPT_TIMEOUT_MS, INVITE_VERIFY_TIMEOUT_MS } from "../../constants/gameInvite.js";
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
    const connectionId = socket.id ?? null;
    const operationId = store.beginAcceptOperation();
    store.markAcceptPending(inviteId, true, operationId);
    store.setInviteError(inviteId, null);

    try {
        let result = await emitAcceptInvite(socket, inviteId, INVITE_ACCEPT_TIMEOUT_MS);

        // 응답을 못 받았으면 같은 연결·같은 계정일 때만 결과를 다시 물음
        if (result?.unknown === true
            && isSameConnection(socket, connectionId)
            && useGameInviteStore.getState().isCurrent(accountGeneration)) {
            const recovered = await emitInviteResult(socket, inviteId, INVITE_VERIFY_TIMEOUT_MS);
            if (recovered?.ok === true && recovered.pending !== true) {
                result = recovered.entered === true && recovered.room
                    ? { ok: true, room: recovered.room, inviteId, recovered: true }
                    : { ok: false, code: "NOT_ENTERED", message: "방에 입장하지 못했습니다." };
            }
        }

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
    } finally {
        // 성공·실패 모두 이 작업 번호의 잠금만 풂
        useGameInviteStore.getState().markAcceptPending(inviteId, false, operationId);
    }
}
