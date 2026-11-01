// 친구 스토어 입구 (create 하는 곳, 액션은 friend/ 아래 묶음별 파일)
// 친구 목록 패널·친구 소켓 훅·목록 동기화 훅·시험이 이 경로로 씀
import { create } from "zustand";

import { loadActions } from "./friend/loadActions.js";
import { relationActions } from "./friend/relationActions.js";
import { seqActions } from "./friend/seqActions.js";
import { requestActions } from "./friend/requestActions.js";
import { lockActions } from "./friend/lockActions.js";
import { initialState } from "./friend/state.js";


export const useFriendStore = create((set, get) => ({
    ...initialState(),
    ...seqActions(set, get),
    ...loadActions(set, get),
    ...relationActions(set, get),
    ...requestActions(set, get),
    ...lockActions(set, get),
}));
