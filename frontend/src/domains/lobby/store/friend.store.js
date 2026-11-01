// 친구 스토어 입구 (create 하는 곳, 액션은 friend/ 아래 묶음별 파일)
// 친구 목록 줄·패널 훅·친구 소켓 처리·목록 동기화·검색 훅·시험이 이 경로로 씀
import { create } from "zustand";

import { loadActions } from "./friend/loadActions.js";
import { relationActions } from "./friend/relationActions.js";
import { seqActions } from "./friend/seqActions.js";
import { requestActions } from "./friend/requestActions.js";
import { lockActions } from "./friend/lockActions.js";
import { initialState } from "./friend/state.js";


// 계정별 상태 + 묶음별 액션을 펼침, 액션끼리는 get()으로 서로 부름
export const useFriendStore = create((set, get) => ({
    ...initialState(),
    ...seqActions(set, get),
    ...loadActions(set, get),
    ...relationActions(set, get),
    ...requestActions(set, get),
    ...lockActions(set, get),
}));
