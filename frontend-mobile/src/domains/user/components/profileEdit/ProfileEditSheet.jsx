// 프로필 사진·테두리 편집 시트 (탭·미리보기·보유 목록·수정하기), 화면 전체를 덮음
// 모바일 MyPage가 { open, onClose }로 씀, 상태는 데스크톱 useProfileBorderEditor 그대로
import { useCallback } from "react"
import OptionGrid from "@m/domains/user/components/profileEdit/OptionGrid.jsx"
import Preview from "@m/domains/user/components/profileEdit/Preview.jsx"
import Tabs from "@m/domains/user/components/profileEdit/Tabs.jsx"
import ConfirmBar from "@m/domains/user/components/wear/ConfirmBar.jsx"
import FullSheet from "@m/domains/user/components/wear/FullSheet.jsx"
// components 아래 있지만 화면 없는 로직 훅이라 eslint 경계 허용 목록(DESKTOP_UI_ALLOW)에 넣어 두고 부름
import { useProfileBorderEditor } from "@/domains/user/components/profileEdit/useProfileBorderEditor.js"
import {
  ERROR_TEXT_CLASS,
  borderAssetSrcForItemId,
  photoAssetSrcForItemId,
} from "@/domains/user/constants/profileEditLayout.js"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 판·테두리·선 색은 데스크톱 프로필 편집 창(PANEL_CLASS·HEADER_CLASS·FOOTER_CLASS) 값
const SHEET_CLASS = "border-[#b83232]/40 bg-[#f5f0e6]"
const LINE_CLASS = "border-[#2a1810]/14"

// 세로: 미리보기 위·목록 아래 / 폰 가로: 미리보기 왼쪽·목록 오른쪽
export default function ProfileEditSheet({ open, onClose }) {
  const editor = useProfileBorderEditor({ open, onClose })
  const { handleConfirm } = editor
  const saving = editor.confirmStatus === "saving"
  const draftPhoto = photoAssetSrcForItemId(editor.draftPhotoItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const draftFrame = borderAssetSrcForItemId(editor.draftBorderItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder

  // 실제로 저장할 때만 확인 소리
  const confirmWithSfx = useCallback(
    () => handleConfirm({ onChanged: () => dispatchUiSfx("ui-confirm") }),
    [handleConfirm],
  )

  return (
    <FullSheet
      open={open}
      onClose={onClose}
      label="프로필 수정"
      header={<Tabs activeTab={editor.activeTab} onTabChange={editor.setActiveTab} />}
      className={SHEET_CLASS}
      headerClassName={LINE_CLASS}
    >
      <div className="flex min-h-0 flex-1 flex-col land:flex-row">
        <div className="land:flex land:w-[38%] land:items-center land:justify-center land:border-r land:border-[#2a1810]/12">
          <Preview photoSrc={draftPhoto} frameSrc={draftFrame} />
        </div>
        <OptionGrid editor={editor} />
      </div>
      <ConfirmBar
        label={saving ? "저장 중…" : "수정하기"}
        ariaLabel="수정하기"
        saving={saving}
        error={editor.confirmError}
        onConfirm={confirmWithSfx}
        src={STORE_ASSETS.purchaseButton}
        errorClass={ERROR_TEXT_CLASS}
        errorRole={null}
        className={LINE_CLASS}
      />
    </FullSheet>
  )
}
