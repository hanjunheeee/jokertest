// 알림 스토어 입구 (zustand create, 액션은 notifications/ 아래 묶음별 파일)
// 알림 창·버튼·소켓 훅, 로비 알림 패널 훅·초대 소리·효과음 런타임이 씀
import { create } from "zustand"

import { initialState } from "./notifications/state.js"
import { accountActions } from "./notifications/accountActions.js"
import { snapshotActions } from "./notifications/snapshotActions.js"
import { readActions } from "./notifications/readActions.js"
import { deleteActions } from "./notifications/deleteActions.js"

// 시험이 이 경로로 가져다 쓰는 이름들
export { __setNotificationsApiForTests } from "./notifications/callApi.js"
export { isNotificationBackedSourceKey, isConfirmedReadRow } from "../utils/notificationRows.js"
export { mergeNotifications } from "../utils/mergeNotifications.js"
export { selectVisibleNotifications, selectUnreadCount } from "../utils/visibleNotifications.js"

// 묶음별 액션을 펼쳐 스토어 하나로 만듦
export const useNotificationsStore = create((set, get) => ({
  ...initialState(),
  ...accountActions(set, get),
  ...snapshotActions(set, get),
  ...readActions(set, get),
  ...deleteActions(set, get),
}))
