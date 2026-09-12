// F-17 알림 API. 쿠키 인증·401 갱신·{data} 해제는 전부 기존 공통 client가 담당한다
// (frontend/src/shared/api/client.js) — 이 파일은 경로와 메서드만 고정한다.
//
// import 경로가 상대 경로인 이유: 이 모듈은 node --test가 변환기 없이 곧장 import하는
// 체인(notifications.store.js) 위에 있고, "@/..." 별칭은 Vite만 해석한다(client.js·
// useSocket.js와 같은 이유).
import { api } from "../../../shared/api/client.js"

/**
 * 이 계정의 알림 **전체**를 최신순으로 가져온다(AC-06).
 *
 * 대상 계정은 서버가 쿠키로 확정한다 — 어떤 계정 인자도 보내지 않는다(A-01).
 * 이 호출은 알림을 만들지도 읽음으로 바꾸지도 않으며, 결과로 소리를 내지 않는다(A-04).
 */
export const fetchNotificationsApi = () => api.get("/notifications")

/**
 * 알림 하나를 읽음으로 확정한다(AC-02). 서버가 확정한 행을 그대로 돌려준다 —
 * 클라이언트가 읽음 시각을 지어내지 않는다. 이미 읽은 알림은 최초 read_at이 유지된다.
 */
export const markNotificationReadApi = (notificationId) =>
  api.patch(`/notifications/${encodeURIComponent(notificationId)}/read`, {})
