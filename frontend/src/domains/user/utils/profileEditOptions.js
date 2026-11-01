// 프로필 편집 창 보유 목록 계산 (종류별 보유 아이템 → 그림 있는 칸, 목록 상태)
// 프로필 테두리·사진 편집 훅이 씀

// 그림 주소를 못 찾는 아이템은 칸에서 뺌
export const ownedOptionsOf = (entitlements, itemType, srcForItemId) => entitlements
  .filter((item) => item.itemType === itemType)
  .map((item) => ({ itemId: item.itemId, src: srcForItemId(item.itemId) }))
  .filter((item) => item.src != null)

// 지갑 불러오기 실패 → error, 아직 → loading, 비었음 → empty
export const listStatusOf = (economyStatus, options) =>
  economyStatus === "error" ? "error"
    : economyStatus === "idle" || economyStatus === "loading" ? "loading"
      : options.length === 0 ? "empty"
        : "ready"
