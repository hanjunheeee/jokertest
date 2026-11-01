// 프로필 사진·테두리 편집 시트 (탭·미리보기·보유 목록·수정하기), 화면 전체를 덮음
// 모바일 MyPage가 { open, onClose }로 씀, 상태는 데스크톱 useProfileBorderEditor 그대로
import { useCallback } from "react"
import OptionGrid from "@m/domains/user/components/profileEdit/OptionGrid.jsx"
import Preview from "@m/domains/user/components/profileEdit/Preview.jsx"
import Tabs from "@m/domains/user/components/profileEdit/Tabs.jsx"
import ConfirmBar from "@m/domains/user/components/wear/ConfirmBar.jsx"
import FullSheet from "@m/domains/user/components/wear/FullSheet.jsx"
// 허용 목록에 있는 로직 훅이지만 components 아래 하위 폴더라 gitignore식 부정 패턴이 못 풀어 줌 (eslint 설정 문제)
import { useProfileBorderEditor } from "@/domains/user/components/profileEdit/useProfileBorderEditor.js"
import {
  borderAssetSrcForItemId,
  photoAssetSrcForItemId,
} from "@/domains/user/constants/profileEditLayout.js"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 데스크톱처럼 밝은 양피지색 판, 세로: 미리보기 위·목록 아래 / 폰 가로: 미리보기 왼쪽·목록 오른쪽
export default function ProfileEditSheet({ open, onClose }) {
  const editor = useProfileBorderEditor({ open, onClose })
  const { handleConfirm } = editor
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
      className="bg-[#f5f0e6]"
    >
      <div className="flex min-h-0 flex-1 flex-col land:flex-row">
        <div className="land:flex land:w-[38%] land:items-center land:justify-center land:border-r land:border-[#2a1810]/12">
          <Preview photoSrc={draftPhoto} frameSrc={draftFrame} />
        </div>
        <OptionGrid editor={editor} />
      </div>
      <ConfirmBar
        label={editor.confirmStatus === "saving" ? "저장 중…" : "수정하기"}
        saving={editor.confirmStatus === "saving"}
        error={editor.confirmError}
        onConfirm={confirmWithSfx}
        className="border-[#2a1810]/14 bg-[#efe7d6]"
      />
    </FullSheet>
  )
}
