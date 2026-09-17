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
import { NON_EDITABLE_SETUP_ITEM_IDS } from "../utils/roomSettingsForm.js"
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
        // 서버에 원래 지정돼 있던 직업만 넘긴다 — 편집을 열고 그대로 저장하는 것만으로
        // 없던 직업별 override가 생기지 않게 한다.
        specifiedRoleNightActionTimes: initialFormState?.specifiedRoleNightActionTimes ?? [],
      })
      return
    }
    onCreateGame(
      buildCreateRoomPayload({
        checks,
        ranges,
        roleComposition: composition,
        specifiedRoleNightActionTimes: initialFormState?.specifiedRoleNightActionTimes,
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
                  setRange={setRange}
                  roleComposition={roleComposition}
                  hiddenItemIds={hiddenItemIds}
                />
              ) : ( // 회의&투표 탭
                <MeetingGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={setRange}
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
