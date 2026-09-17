/**
 * 인게임 설정 양피지 패널 (prototype: 인게임 설정 프레임_.png)
 * GameSetupPage 중앙 — 탭 전환·설정 목록·게임 만들기 버튼
 *
 * props
 * - visible: true면 입장 연출 후 클릭 허용 (부모 uiVisible과 동기)
 * - isCreating: 방 생성 요청이 진행 중이면 true (게임 만들기 버튼 비활성화용)
 * - onCreateGame: "게임 만들기" 클릭 시 create_room payload를 담아 호출 (부모에서 emit 처리)
 *
 * 에셋은 constants/gameSetupAssets.js, 탭·항목 정의는 constants/gameSetupOptions.js 참고
 */
import { motion } from "framer-motion"
import { useRef, useState } from "react"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import { useRoleCompositionState } from "../hooks/useRoleCompositionState.js"
import { useSetupContentScrollOnRoleModeChange } from "../hooks/useSetupContentScrollOnRoleModeChange.js"
import { useSetupTabState } from "../hooks/useSetupTabState.js"
import { buildCreateRoomPayload } from "../utils/buildCreateRoomPayload.js"
import {
  NIGHT_TIME_ID_TO_ROLE,
  NON_EDITABLE_SETUP_ITEM_IDS,
  OVERALL_NIGHT_ACTION_TIME_ID,
  mergeSpecifiedRoleNightActionTimes,
} from "../utils/roomSettingsForm.js"
import GameSetupCreateButton from "./GameSetupCreateButton.jsx"
import GameSetupTabs from "./GameSetupTabs.jsx"
import GeneralGameSetupTab from "./GeneralGameSetupTab.jsx"
import MeetingGameSetupTab from "./MeetingGameSetupTab.jsx"
// 경로 별칭(@/) 대신 상대 경로를 쓰는 이유는 RoomListRow.jsx 맨 위 주석과 같습니다.
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../shared/constants/customScrollbarStyles.js"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.82]"

const PANEL_CLASS =
  "flex w-[min(76rem,96vw)] flex-col items-center"

/** 인게임 설정 프레임_.png — 상단 탭 + 양피지 본문 (프레임 내부) */
const FRAME_OVERLAY_INSET = {
  paddingTop: "3.75%",
  paddingBottom: "14%",
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
}

/** 탭과 분리 — 설정 목록(일반·회의&투표 본문)만 아래로 */
const SETUP_CONTENT_CLASS =
  `flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip pt-[clamp(1.35rem,1.85vh,2.5rem)] pb-[clamp(3.25rem,5vh,4.25rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 일반+회의&투표 두 탭이 "게임 만들기" 시점에 값을 함께 모을 수 있으려면 같은 상태를
// 공유해야 한다. 각 탭이 따로 useSetupTabState를 부르면 탭을 전환할 때 다른 쪽 탭에서
// 입력한 값을 잃어버리므로, 이 패널에서 두 탭의 항목을 합쳐 한 번만 상태를 만든다.
const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

/**
 * 프레임·탭·본문·제출 버튼을 묶는 설정 패널.
 *
 * F-20: 같은 패널을 두 모드에서 쓴다.
 *   - 'create'(기본): 지금까지와 동일. items 기본값에서 시작해 create_room payload를 만든다.
 *   - 'edit': 서버가 확정한 설정(initialFormState)에서 시작하고, D-12의 추가 규칙 세 항목을
 *     그리지 않으며, 제출은 폼 상태를 그대로 부모에게 넘긴다(요청 조립은 부모가 한다 —
 *     roomId·requestId·expectedSettingsVersion은 화면이 아니라 방 상태가 아는 값이기 때문).
 *
 * @param {'create'|'edit'} [mode]
 * @param {{checks:object, ranges:object,
 *          roleComposition:{mode:string,roleCounts:object|null},
 *          specifiedRoleNightActionTimes:string[]}} [initialFormState]
 * @param {unknown} [formResetKey] - 이 값이 바뀌면 폼을 initialFormState로 다시 맞춘다
 *   (방 교체·설정 버전 교체·방장 이전 시 이전 초안을 남기지 않기 위한 명시적 경계).
 */
export default function GameSetupPanel({
  visible,
  isCreating,
  onCreateGame,
  mode = "create",
  initialFormState = null,
  formResetKey = null,
  submitLabel,
  submitBusyLabel,
  submitDisabled = false,
}) {
  const setupContentRef = useRef(null)
  const isEditMode = mode === "edit"
  // 현재 선택된 설정 탭 id입니다.
  const [activeTab, setActiveTab] = useState("general")
  const { checks, ranges, setCheck, setRange } = useSetupTabState(ALL_SETUP_ITEMS, {
    initialState: initialFormState,
    resetKey: formResetKey,
  })
  // 역할 구성은 "최대 플레이어 수"에 의존하므로(파생 시민 수·합계 검증) 같은 패널에서
  // 함께 소유한다 — max-players가 바뀌면 다음 렌더에서 곧바로 다시 계산된다.
  const roleComposition = useRoleCompositionState({
    maxPlayers: ranges["max-players"],
    autoJokerCount: ranges["joker-count"],
    initialComposition: initialFormState?.roleComposition ?? null,
    resetKey: formResetKey,
  })

  useSetupContentScrollOnRoleModeChange(setupContentRef, roleComposition.mode, activeTab)

  // F-20(AC-03): 이번 편집에서 **값이 실제로 바뀐** 직업별 밤 시간 스테퍼 id를 기억한다.
  // 서버의 지정 목록만 그대로 돌려보내면 "없던 override가 생기지 않는다"는 성질은 지켜지지만,
  // 방장이 새로 만든 override까지 함께 사라진다 — 화면에는 바뀐 값이 보이는데 요청에는
  // 실리지 않는 상태가 된다. 두 사실을 합쳐야 둘 다 성립한다.
  const [editedRoleTimeIds, setEditedRoleTimeIds] = useState(() => new Set())
  // 폼을 서버 최신값으로 되맞추는 경계(방 교체·설정 버전 교체·방장 이전)에서는 편집 흔적도
  // 함께 버린다 — 남기면 이전 방장의 초안이 다음 요청에 섞인다.
  const [appliedResetKey, setAppliedResetKey] = useState(formResetKey)
  if (appliedResetKey !== formResetKey) {
    setAppliedResetKey(formResetKey)
    setEditedRoleTimeIds(new Set())
  }

  /** 스테퍼 변경을 그대로 전달하면서, 직업별 밤 시간은 "건드렸다"는 사실도 함께 남긴다. */
  const handleSetRange = (id, next) => {
    const changed = ranges[id] !== next
    if (NIGHT_TIME_ID_TO_ROLE[id] !== undefined && changed) {
      setEditedRoleTimeIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    setRange(id, next)

    // F-20(AC-03): 편집 화면에서 **아직 아무도 지정하지 않은** 직업 행은 전체 밤 시간을
    // 그대로 따라간다. 폼을 열 때의 폴백(buildRoomSettingsFormState)만 고치고 여기를 두면,
    // 전체 밤 시간을 60→90으로 바꾼 순간부터 그 행들은 60을 계속 보여준다 — 서버는 90을
    // 쓰는데 방장은 60이라고 읽고, 그 행의 다음 클릭도 60에서 출발해 의도하지 않은 override가
    // 만들어진다. "지정했다"는 사실 자체는 여기서 만들지 않으므로(editedRoleTimeIds 불변),
    // 손대지 않은 저장은 여전히 override를 싣지 않는다.
    //
    // 생성 화면(mode='create')에는 "지정하지 않음"이라는 상태가 없다 — 네 직업 모두 명시값이고
    // 그대로 실린다. 그래서 이 따라가기는 편집 모드에만 적용한다(기존 생성 계약 보존).
    if (!isEditMode || id !== OVERALL_NIGHT_ACTION_TIME_ID || !changed) return
    const serverSpecified = initialFormState?.specifiedRoleNightActionTimes ?? []
    for (const [roleTimeId, role] of Object.entries(NIGHT_TIME_ID_TO_ROLE)) {
      // 서버가 명시한 override와 이번에 방장이 직접 바꾼 값은 전체 시간과 독립이다.
      if (serverSpecified.includes(role) || editedRoleTimeIds.has(roleTimeId)) continue
      setRange(roleTimeId, next)
    }
  }

  // 편집 모드에서는 D-12의 세 항목을 아예 그리지 않는다 — 이 슬라이스의 편집 대상이 아니고,
  // 서버도 수정 요청에서 그 값을 받지 않는다(기존 값은 서버가 보존한다).
  const hiddenItemIds = isEditMode ? NON_EDITABLE_SETUP_ITEM_IDS : undefined

  const handleSubmitClick = () => {
    // 검증에 실패한 구성은 애초에 버튼이 비활성화돼 여기까지 오지 않지만, 상태가 바뀌는
    // 사이의 클릭까지 막기 위해 emit 직전에 한 번 더 확인한다(최종 판단은 서버가 한다).
    if (!roleComposition.validation.ok) return
    if (isCreating || submitDisabled) return

    const composition = { mode: roleComposition.mode, roleCounts: roleComposition.roleCounts }
    if (isEditMode) {
      onCreateGame({
        checks,
        ranges,
        roleComposition: composition,
        // 서버에 원래 지정돼 있던 직업 + 이번에 실제로 바꾼 직업. 앞쪽 때문에 "열고 그대로
        // 저장"이 없던 override를 만들지 않고, 뒤쪽 때문에 새로 만든 override가 누락되지 않는다.
        specifiedRoleNightActionTimes: mergeSpecifiedRoleNightActionTimes(
          initialFormState?.specifiedRoleNightActionTimes ?? [], editedRoleTimeIds,
        ),
      })
      return
    }
    onCreateGame(
      buildCreateRoomPayload({
        checks,
        ranges,
        roleComposition: composition,
        // 생성 화면에는 "지정 목록"이라는 출발점이 없다 — 이때 변환기는 undefined를 돌려주고
        // 기존 생성 계약대로 스테퍼 전부가 실린다.
        specifiedRoleNightActionTimes: mergeSpecifiedRoleNightActionTimes(
          initialFormState?.specifiedRoleNightActionTimes, editedRoleTimeIds,
        ),
      }),
    )
  }

  return (
    <div
      className={PANEL_WRAP_CLASS}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <motion.div
        className={PANEL_CLASS}
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
      >
        <div className="relative">
          <PublicAsset
            src={GAME_SETUP_ASSETS.frame}
            alt="인게임 설정"
            className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
          />

          <div
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            style={FRAME_OVERLAY_INSET}
          >
            <GameSetupTabs activeTab={activeTab} onSelect={setActiveTab} />

            <div ref={setupContentRef} className={SETUP_CONTENT_CLASS}>
              {activeTab === "general" ? ( // 일반 탭
                <GeneralGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={handleSetRange}
                  roleComposition={roleComposition}
                  hiddenItemIds={hiddenItemIds}
                />
              ) : ( // 회의&투표 탭
                <MeetingGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={handleSetRange}
                  hiddenItemIds={hiddenItemIds}
                />
              )}
            </div>
          </div>
        </div>

        {/* 역할 구성이 유효하지 않은 동안에는 생성 자체를 막는다(회의&투표 탭에 있어도
            동일하게 적용된다 — 잘못된 설정이 탭 전환으로 가려지면 안 되기 때문). */}
        <GameSetupCreateButton
          onClick={handleSubmitClick}
          disabled={isCreating || submitDisabled || !roleComposition.validation.ok}
          label={submitLabel ?? (isEditMode ? "설정 저장" : "게임 만들기")}
          busy={isCreating}
          busyLabel={submitBusyLabel ?? (isEditMode ? "저장 중…" : null)}
        />
      </motion.div>
    </div>
  )
}
