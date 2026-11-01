// 기기에 저장한 구매 기록 검사·되살리기 (모양이 틀린 기록은 던져서 막음)
// purchaseController.js가 계정 붙일 때 되살리기·구매 중 상태 판정에 씀
import { goldStatuses } from "../constants/purchaseController.js"

// 결과를 아직 모르는 상태 (보낸 뒤 기다림·결과 모름)
export const unresolved = (status) => status === "pending" || status === "unknown"
// 비지 않고 max 글자 이하
export const validText = (value, max) => typeof value === "string" && value.length >= 1 && value.length <= max
// 0보다 큰 정수 버전
export const validVersion = (value) => Number.isSafeInteger(value) && value > 0
// 서버에 골드 구매 결과가 없음 (그때만 같은 id로 다시 보내도 됨)
export const isGoldResultMissing = (error) =>
  error?.status === 404 && error?.success === false && error?.code === "PURCHASE_RESULT_NOT_FOUND"

// 결과를 모르고 끝난 구매는 되살릴 때 결과 모름으로 둠
export const restore = (saved) => {
  // 골드 구매 기록: 칸 하나라도 틀리면 던짐
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
  // 일반 구매 기록: 상품 id·상태 검사, 결과 모름인데 id·상품이 비면 던짐
  if (!Array.isArray(saved.itemIds) || !saved.itemIds.every(x => typeof x === "string")
    || !["idle", "pending", "unknown", "confirmed", "rejected"].includes(saved.status)
    || (unresolved(saved.status) && (!saved.referenceEventId || !saved.itemIds.length))) throw new Error("Invalid record")
  return { ...saved, status: unresolved(saved.status) ? "unknown" : saved.status }
}
