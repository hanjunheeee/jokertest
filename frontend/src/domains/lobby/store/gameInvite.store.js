// 게임 초대 스토어 입구 (create 하는 곳, 액션은 gameInvite/ 아래 묶음별 파일)
// 친구 목록 줄·패널 초대 훅·초대 소켓 처리·시험이 이 경로로 씀
import { create } from "zustand";

import { snapshotActions } from "./gameInvite/snapshotActions.js";
import { soundActions } from "./gameInvite/soundActions.js";
import { respondActions } from "./gameInvite/respondActions.js";
import { sendActions } from "./gameInvite/sendActions.js";
import { accountActions } from "./gameInvite/accountActions.js";
import { initialState } from "./gameInvite/state.js";

// 시험이 쓰던 이름 그대로 다시 내보냄
export { selectPending as selectPendingInvites } from "../utils/gameInvite/invites.js";

// 계정별 상태 + 묶음별 액션을 펼침, 액션끼리는 get()으로 서로 부름
export const useGameInviteStore = create((set, get) => ({
    ...initialState(),
    ...accountActions(set, get),
    ...snapshotActions(set, get),
    ...soundActions(set, get),
    ...respondActions(set, get),
    ...sendActions(set, get),
}));
