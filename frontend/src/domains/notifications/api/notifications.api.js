// 알림 목록 받기·읽음·읽은 알림 지우기 HTTP 요청
// 알림 스토어의 callApi.js가 처음 부를 때 늦게 불러와 씀
import { api } from "../../../shared/api/client.js"

// 내 알림 목록 받기 (복원용)
export const fetchNotificationsApi = () => api.get("/notifications")

// 알림 하나 읽음, 돌려받은 줄로 읽음 확정 봄
export const markNotificationReadApi = (notificationId) =>
  api.patch(`/notifications/${encodeURIComponent(notificationId)}/read`, {})

// 읽은 알림 한꺼번에 지우기
export const deleteReadNotificationsApi = () => api.delete("/notifications/read")
