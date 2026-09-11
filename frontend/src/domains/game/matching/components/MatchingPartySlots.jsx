/**
 * 매칭 팝업 파티 슬롯 그리드 — 준비/미준비 실루엣을 5열·최대 2행으로 표시
 * MatchingPopupContent에서 slots 배열을 넘겨 사용
 *
 * props
 * - slots: { id, ready }[] — 준비 여부에 따라 실루엣 이미지 분기
 *
 * 6명 이상이면 2행·컴팩트 크기, 5명 이하는 1행·큰 크기
 * 스타일은 constants/matchingPopupStyles.js 참고
 */
import PlayerSlotGrid from "./PlayerSlotGrid.jsx"
import { PLAYER_SLOT_COLUMNS } from "../utils/chunkPlayerSlots.js"
import { MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_SLOT_BADGE_NOT_READY_CLASS,
  MATCHING_SLOT_BADGE_READY_CLASS,
  MATCHING_SLOT_PORTRAIT_WRAP_CLASS_COMPACT,
  MATCHING_SLOT_PORTRAIT_WRAP_CLASS_LARGE,
  MATCHING_SLOT_WRAP_CLASS,
  MATCHING_SLOTS_GRID_CLASS,
  MATCHING_SLOTS_ROW_CLASS,
} from "../constants/matchingPopupStyles.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

export { PLAYER_SLOT_COLUMNS as MATCHING_SLOT_COLUMNS }

/**
 * 파티 슬롯 그리드 — F-13(AC-05): 준비 여부만 다른 공용 실루엣 대신, 슬롯이 실제 방
 * 참가자(accountProfilePhotoId/accountProfileBorderId, useMatchingPage.js가 room.players에서
 * 그대로 옮겨온 값)를 담고 있으면 계정별로 서로 다른 실제 초상·테두리를 그린다. 대기방에
 * 아직 들어가지 않은 더미 슬롯(MATCHING_PARTY_SLOTS_DUMMY_10)은 그 필드가 없어
 * resolveAccountProfileAssets가 기본 자산으로 대체한다 — 기존 더미 미리보기와 동일하게
 * 동작한다. 준비/미준비 여부는 이제 배지로만 구분한다.
 */
export default function MatchingPartySlots({ slots = [] }) {
  const rowCount = Math.ceil(slots.length / PLAYER_SLOT_COLUMNS) || 1
  const portraitWrapClass =
    rowCount > 1 ? MATCHING_SLOT_PORTRAIT_WRAP_CLASS_COMPACT : MATCHING_SLOT_PORTRAIT_WRAP_CLASS_LARGE

  return (
    <PlayerSlotGrid
      slots={slots}
      columns={PLAYER_SLOT_COLUMNS}
      className={MATCHING_SLOTS_GRID_CLASS}
      rowClassName={MATCHING_SLOTS_ROW_CLASS}
      renderSlot={(slot) => {
        const { portraitSrc, frameSrc } = resolveAccountProfileAssets(slot)
        return (
          <div key={slot.id} className={MATCHING_SLOT_WRAP_CLASS}>
            <PlayerProfilePortrait
              photoSrc={portraitSrc}
              frameSrc={frameSrc}
              wrapClassName={portraitWrapClass}
            />
            <span className={slot.ready ? MATCHING_SLOT_BADGE_READY_CLASS : MATCHING_SLOT_BADGE_NOT_READY_CLASS}>
              {slot.ready ? MATCHING_POPUP_COPY.readyBadge : MATCHING_POPUP_COPY.notReadyBadge}
            </span>
          </div>
        )
      }}
    />
  )
}
