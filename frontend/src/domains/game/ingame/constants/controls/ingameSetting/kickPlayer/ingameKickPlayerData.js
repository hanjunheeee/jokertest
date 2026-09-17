/**
 * 플레이어 추방 모달 — 문구·라벨 (store/API 연동 전 UI용).
 */

export const INGAME_KICK_PLAYER_MODAL_COPY = {
  title: "플레이어 추방",
  subtitle: "추방할 플레이어를 선택하세요.",
  notice: "선택한 플레이어는 이번 판을 마친 뒤, 다음 판 시작 전에 추방됩니다.",
  kickActionLabel: "추방",
  pendingLabel: "추방 예정",
  cancelPendingAriaLabel: "추방 취소",
  closeAriaLabel: "플레이어 추방 닫기",
  listAriaLabel: "추방 대상 플레이어 목록",
  // F-21(AC-02): 대상이 없다는 것은 **명시적인 상태**다. 빈 목록만 그리면 아직 못 불러온
  // 것인지 정말 아무도 없는 것인지 화면이 말하지 못한다.
  emptyTargets: "추방할 수 있는 참가자가 없습니다.",
}
