import { api } from "../../../shared/api/client.js"

export const fetchNotificationsApi = () => api.get("/notifications")

export const markNotificationReadApi = (notificationId) =>
  api.patch(`/notifications/${encodeURIComponent(notificationId)}/read`, {})

export const deleteReadNotificationsApi = () => api.delete("/notifications/read")
