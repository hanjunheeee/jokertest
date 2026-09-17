// 파일 역할: RoomSettingsSummaryPanel.jsx - 대기방의 현재 방 설정을 읽기 전용으로 보여줍니다.
/**
 * F-20(AC-03): 대기방 참가자가 **지금 이 방의 설정**을 실제로 읽는 화면.
 *
 * 왜 필요한가: 설정을 바꿀 수 있는 것은 방장뿐이지만, 그 결과를 가장 먼저 알아야 하는 사람은
 * 나머지 참가자다. 편집 패널은 방장에게만 열리고 공개 목록은 대기방 밖에 있으므로, 이 패널이
 * 없으면 비방장 참가자는 정원이 줄었는지 밤 시간이 바뀌었는지 화면에서 확인할 방법이 없다.
 *
 * 무엇을 보여주는가: 서버가 확정해 store에 내려준 값만 보여준다(accessType·settings).
 *   - 입장 방식 · 정원 · 직업 구성과 인원 · 토론/투표/밤 및 직업별 밤 제한시간
 * 무엇을 보여주지 않는가:
 *   - 개인별로 배정된 역할(대기방에는 존재하지도 않는다)
 *   - 방 코드(공유는 별도의 초대 코드 모달이 소유한다)
 *   - settingsVersion 같은 내부 카운터·진단값
 *
 * 표시 문구는 공개 방 목록 행과 **같은 변환기**(summarizeRoomListSettings)를 쓴다. 두 곳이
 * 각자 문자열을 만들면 같은 서버 설정이 화면마다 다르게 읽힌다.
 */
import { summarizeRoomListSettings } from "@/domains/game/mode/utils/summarizeRoomListSettings.js"

const ACCESS_TYPE_LABELS = Object.freeze({
  open: "공개 참가",
  code: "코드로만 참가",
})

const PANEL_CLASS =
  "absolute left-6 top-1/2 z-30 w-[min(20rem,26vw)] -translate-y-1/2 rounded-md border border-[#c9b892]/60 bg-black/60 px-4 py-3 text-[#f5f0e6]"

const ROW_LABEL_CLASS = "font-subheading text-[#c9b892]"

/**
 * @param {{accessType?: string|null, settings?: object|null, visible?: boolean}} props
 *   settings는 서버가 buildRoomPayload/room_settings_updated로 확정해 준 값 그대로다.
 */
export default function RoomSettingsSummaryPanel({ accessType, settings, visible = true }) {
  // 아직 서버 설정을 확보하지 못했으면 아무것도 지어내지 않는다 — 빈 값을 기본값처럼 그리면
  // 참가자가 서버와 다른 설정을 읽게 된다.
  if (!visible || settings === null || typeof settings !== "object") return null

  const { roles, times } = summarizeRoomListSettings(settings)
  const accessLabel = ACCESS_TYPE_LABELS[accessType] ?? null
  const maxPlayers = Number.isInteger(settings.maxPlayers) ? settings.maxPlayers : null

  return (
    <section className={PANEL_CLASS} aria-label="현재 방 설정">
      <h2 className="mb-2 font-subheading font-bold">현재 방 설정</h2>
      <dl className="flex flex-col gap-1 text-sm">
        {accessLabel ? (
          <div className="flex gap-2">
            <dt className={ROW_LABEL_CLASS}>입장 방식</dt>
            <dd>{accessLabel}</dd>
          </div>
        ) : null}
        {maxPlayers !== null ? (
          <div className="flex gap-2">
            <dt className={ROW_LABEL_CLASS}>정원</dt>
            <dd>{`${maxPlayers}명`}</dd>
          </div>
        ) : null}
        {roles ? (
          <div className="flex gap-2">
            <dt className={ROW_LABEL_CLASS}>직업 구성</dt>
            <dd>{roles}</dd>
          </div>
        ) : null}
        {times ? (
          <div className="flex gap-2">
            <dt className={ROW_LABEL_CLASS}>제한시간</dt>
            <dd>{times}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
