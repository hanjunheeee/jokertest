// 클릭 경로에서 기본 클릭 소리를 낼 버튼 찾기 (누를 수 있는 요소인지·잠겼는지·제출 버튼인지)
// 화면 전체 클릭 소리(uiClickSfx)가 씀

// 버튼·링크·체크/라디오 입력, 그리고 그런 role을 단 요소
function isActivatableControl(node) {
  if (node === null || typeof node !== "object" || node.nodeType !== 1) return false
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  const role = typeof node.getAttribute === "function" ? node.getAttribute("role") : null
  if (tag === "button") return true
  if (tag === "a" && typeof node.getAttribute === "function" && node.getAttribute("href") !== null) return true
  if (tag === "input") {
      const type = (node.getAttribute?.("type") ?? "").toLowerCase()
    return type === "button" || type === "checkbox" || type === "radio"
  }
  return role === "button" || role === "checkbox" || role === "radio" || role === "menuitem" || role === "tab"
}

// 잠긴 버튼(disabled·aria-disabled·inert)은 소리 안 냄
function isDisabledControl(node) {
  if (node.disabled === true) return true
  if (typeof node.getAttribute !== "function") return false
  if (node.getAttribute("aria-disabled") === "true") return true
  if (node.hasAttribute?.("inert")) return true
  return false
}

// 폼 안의 type 없는 버튼도 제출 버튼으로 봄
function isSubmitControl(node) {
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  const type = (node.getAttribute?.("type") ?? "").toLowerCase()
  if (tag === "button") return type === "submit" || (type === "" && node.form != null)
  if (tag === "input") return type === "submit"
  return false
}

// 가장 안쪽 버튼을 고름, 경로에 data-sfx-owner="explicit"이 있거나 잠긴·제출 버튼이면 null
export function findGenericOwner(nativeEvent) {
  const path =
    typeof nativeEvent.composedPath === "function"
      ? nativeEvent.composedPath()
      : [nativeEvent.target].filter(Boolean)

  let control = null
  for (const node of path) {
    if (node === null || typeof node !== "object" || node.nodeType !== 1) continue
    if (typeof node.getAttribute === "function" && node.getAttribute("data-sfx-owner") === "explicit") return null
    if (control === null && isActivatableControl(node)) {
      if (isDisabledControl(node) || isSubmitControl(node)) return null
      control = node
    }
  }
  return control
}
