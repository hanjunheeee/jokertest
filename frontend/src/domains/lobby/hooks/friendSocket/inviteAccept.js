// 게임 초대 수락 흐름 (수락 요청 → 결과 모르면 다시 묻기 → 지금 방 확인 → 방 화면으로 이동)
// 친구 목록 패널·친구 소켓 훅·시험이 씀
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

export const getNavigate = () => navigateToApp;
export const setNavigate = (next) => { navigateToApp = next; };

// 실패를 초대 오류로 남기고, 목록이 실제와 달라졌을 수 있어 스냅샷을 다시 받음
const failWith = (inviteId, message) => {
    useGameInviteStore.getState().setInviteError(inviteId, message);
    loadInviteSnapshotAndPlayNew();
};

// 수락 요청 하나를 끝까지 처리함, 끝나면 수락 잠금은 같은 작업 번호로만 풂
export async function requestGameInviteAccept(inviteId) {
    if (typeof inviteId !== "string" || inviteId.length === 0) return { ok: false, code: "INVALID_REQUEST" };

    const accountGeneration = useGameInviteStore.getState().syncAccount();
    const store = useGameInviteStore.getState();
    if (store.pendingInviteIds.has(inviteId)) return { ok: false, code: "IN_PROGRESS" };

    const socket = getSocket();
    if (!socket) {
        store.setInviteError(inviteId, "연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return { ok: false, code: "NO_SOCKET" };
    }

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

        if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };

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

        useInGameStore.getState().clearGame();
        useMatchingStore.getState().setRoom(verifiedRoom);
        navigateToApp?.("/game-matching");
        return { ...result, room: verifiedRoom };
    } finally {
        useGameInviteStore.getState().markAcceptPending(inviteId, false, operationId);
    }
}
