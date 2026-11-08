// 신고 서버 요청 (POST /reports)
// hooks/useReportDialog.js가 씀
import { api } from "@/shared/api/client.js"

export const reportApi = {
  // 본문 { targetUuid, gameId, reasonCode, memo? }, 성공이면 { ok, reportId }
  submit: (body) => api.post("/reports", body),
}
