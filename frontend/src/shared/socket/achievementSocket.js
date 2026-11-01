// 업적 받음 소켓 이벤트 받기
// useSfxRuntime 훅이 업적 소리를 낼 때 씀

// 등록하고 끄는 함수를 돌려줌
export function onAchievementGranted(socket, handler) {
  socket.on("achievement_granted", handler)
  return () => socket.off("achievement_granted", handler)
}
