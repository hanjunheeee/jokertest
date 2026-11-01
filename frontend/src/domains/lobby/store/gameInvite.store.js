// 게임 초대 스토어 입구 (create 하는 곳, 액션은 gameInvite/ 아래 묶음별 파일)
// 친구 목록 패널·초대 소켓 훅·시험이 이 경로로 씀
import { create } from "zustand";

import { snapshotActions } from "./gameInvite/snapshotActions.js";
import { soundActions } from "./gameInvite/soundActions.js";
import { respondActions } from "./gameInvite/respondActions.js";
import { sendActions } from "./gameInvite/sendActions.js";
import { accountActions } from "./gameInvite/accountActions.js";
import { initialState } from "./gameInvite/state.js";

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export {
    compareSeq as compareCreationSeq,
    isUsable as isUsableInvite,
    survives as survivesSnapshot,
    merge as mergeInvites,
    isTerminalRefusal as establishesTerminalRefusal,
    isActionable as isActionablePending,
    selectPending as selectPendingInvites,
} from "../utils/gameInvite/invites.js";
export { evalSound as evaluateInviteSound } from "../utils/gameInvite/inviteSound.js";

export const useGameInviteStore = create((set, get) => ({
    ...initialState(),
    ...accountActions(set, get),
    ...snapshotActions(set, get),
    ...soundActions(set, get),
    ...respondActions(set, get),
    ...sendActions(set, get),
}));
