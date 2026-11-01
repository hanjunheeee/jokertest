// 펼침면 두 쪽 놓기 (한 쪽씩이면 고른 면만, 두 쪽 모양이면 가운데 접힌 선 두고 나란히)
// forbidden·guests 탭 화면이 씀

// pageKey가 바뀌면 새로 그려 쪽 안 등장 움직임(데스크톱 값)이 다시 보임, stickyRight면 긴 왼쪽을 내려도 오른쪽 그림이 따라옴
export default function SpreadPages({ left, right, side, twoColumn, pageKey, stickyRight = false }) {
  if (twoColumn) {
    return (
      <div key={pageKey} className="grid min-h-full grid-cols-2 gap-0">
        <div className="min-w-0 border-r border-[#2a1810]/20 pr-4">{left}</div>
        <div className={`min-w-0 pl-4 ${stickyRight ? "sticky top-0 self-start" : ""}`}>{right}</div>
      </div>
    )
  }

  return (
    <div key={`${pageKey}-${side}`} className="min-h-full">
      {side === 0 ? left : right}
    </div>
  )
}
