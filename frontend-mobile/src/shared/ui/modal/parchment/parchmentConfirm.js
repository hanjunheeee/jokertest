// 전역 confirm → 양피지 확인 창 (삭제·나가기 등 공용 로직의 appConfirm)
// main.jsx가 install, ParchmentConfirmHost가 표시

import { setAppConfirmHandler } from "@/shared/utils/appConfirm.js"

const listeners = new Set()
let pending = null

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribeParchmentConfirm(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getParchmentConfirmState() {
  return pending
}

export function showParchmentConfirm(message) {
  return new Promise((resolve) => {
    pending = { message: String(message ?? ""), resolve }
    emit()
  })
}

export function resolveParchmentConfirm(accepted) {
  if (!pending) return
  const { resolve } = pending
  pending = null
  emit()
  resolve(Boolean(accepted))
}

export function installParchmentConfirm() {
  if (typeof window === "undefined") return
  setAppConfirmHandler(showParchmentConfirm)
}