// 기기에 저장한 구매 기록 검사·되살리기 (모양이 틀린 기록은 던져서 막음)
// 구매 흐름 컨트롤러가 계정을 붙일 때 씀
// 검사 코드는 원래 purchaseController.js 내용 그대로 옮김 (바꾸지 않음)
import { goldStatuses } from "../constants/purchaseController.js"

export const unresolved = (status) => status === "pending" || status === "unknown"
export const validText = (value, max) => typeof value === "string" && value.length >= 1 && value.length <= max
export const validVersion = (value) => Number.isSafeInteger(value) && value > 0
export const isGoldResultMissing = (error) =>
  error?.status === 404 && error?.success === false && error?.code === "PURCHASE_RESULT_NOT_FOUND"

// 결과를 모르고 끝난 구매는 되살릴 때 결과 모름으로 둠
export const restore = (saved) => {
  if (Object.hasOwn(saved, "kind")) {
    if (saved.kind !== "GOLD" || !goldStatuses.includes(saved.status) || !validText(saved.productId, 64)
      || !validVersion(saved.version) || !validText(saved.referenceEventId, 150)
      || !Array.isArray(saved.itemIds) || saved.itemIds.length) throw new Error("Invalid record")
    return {
      kind: "GOLD", status: unresolved(saved.status) ? "unknown" : saved.status, referenceEventId: saved.referenceEventId,
      itemIds: [], productId: saved.productId, version: saved.version,
      code: typeof saved.code === "string" ? saved.code : null, error: typeof saved.error === "string" ? saved.error : null,
    }
  }
  if (!Array.isArray(saved.itemIds) || !saved.itemIds.every(x => typeof x === "string")
    || !["idle", "pending", "unknown", "confirmed", "rejected"].includes(saved.status)
    || (unresolved(saved.status) && (!saved.referenceEventId || !saved.itemIds.length))) throw new Error("Invalid record")
  return { ...saved, status: unresolved(saved.status) ? "unknown" : saved.status }
}
