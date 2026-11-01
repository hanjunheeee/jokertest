// 알림 스토어 입구 (zustand create)
// 알림 창·알림 버튼·알림 소켓 훅·친구 소켓 훅이 씀, 액션은 store/notifications/ 아래 묶음별 파일
import { create } from "zustand"

import { initialState } from "./notifications/state.js"
import { accountActions } from "./notifications/accountActions.js"
import { snapshotActions } from "./notifications/snapshotActions.js"
import { readActions } from "./notifications/readActions.js"
import { deleteActions } from "./notifications/deleteActions.js"

export { __setNotificationsApiForTests } from "./notifications/callApi.js"
export { SETTING_KEY_BY_TYPE } from "../constants/notificationSettingKeys.js"
export { isNotificationBackedSourceKey, isConfirmedReadRow } from "../utils/notificationRows.js"
export { mergeNotifications } from "../utils/mergeNotifications.js"
export { selectVisibleNotifications, selectUnreadCount } from "../utils/visibleNotifications.js"

export const useNotificationsStore = create((set, get) => ({
  ...initialState(),
  ...accountActions(set, get),
  ...snapshotActions(set, get),
  ...readActions(set, get),
  ...deleteActions(set, get),
}))
