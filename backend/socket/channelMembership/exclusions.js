// 채널 전달 제외 목록 파일
// 채널별·소켓별 제외 기록(주인마다 따로) + 넘치면 경보, 같은 폴더 방송·떼기가 씀
// index 거쳐 matchmaking 입장·끊김·방 소속, gameSession 받을 사람 판정도 씀
const { isNonEmptyString } = require('../common/shape')
const { getOrCreate } = require('../common/maps')
const { DEFAULT_EXCLUSION_OWNER, CHANNEL_EXCLUSION_ALARM_ENTRIES } = require('./constants')

// channelId → socketId → 제외 건 주인들
const channelExclusions = new Map()

// 주인 이름 번호, 전체 제외 수, 경보 냈는지 (경보는 넘칠 때 한 번만)
let exclusionOwnerSeq = 0
let channelExclusionCount = 0
let alarmRaised = false

// 제외 주인 이름 새로 뽑기 (떼기 작업마다 하나)
function createChannelExclusionOwner(label = 'owner') {
    exclusionOwnerSeq += 1
    return `${label}#${exclusionOwnerSeq}`
}

// 채널 전달에서 이 소켓 빼기 (주인마다 따로 세서, 다른 주인이 풀어도 남음)
function excludeSocketFromChannel(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    // 채널·소켓 id 없으면 안 걺
    if (!isNonEmptyString(channelId)) return
    if (!isNonEmptyString(socketId)) return
    // 같은 주인이 두 번 걸어도 한 번으로 셈
    const bySocket = getOrCreate(channelExclusions, channelId, () => new Map())
    const owners = getOrCreate(bySocket, socketId, () => new Set())
    if (owners.has(owner)) return
    owners.add(owner)
    channelExclusionCount += 1
    // 수위 넘으면 경보 한 번 (기록은 계속 받음, 새는 곳 찾기용)
    if (!alarmRaised && channelExclusionCount > CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        alarmRaised = true
        console.error('[채널 전달 제외 수위 초과]', {
            code: 'CHANNEL_EXCLUSION_OVER_CAPACITY',
            entries: channelExclusionCount,
            alarmAt: CHANNEL_EXCLUSION_ALARM_ENTRIES,
        })
    }
}

// 수위 아래로 내려오면 경보 다시 켤 수 있게
function rearmExclusionAlarm() {
    if (alarmRaised && channelExclusionCount <= CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        alarmRaised = false
    }
}

// 이 주인이 건 제외만 풀기 (주인 없어진 소켓·채널 칸은 지움)
function releaseChannelExclusion(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    const bySocket = channelExclusions.get(channelId)
    const owners = bySocket?.get(socketId)
    // 이 주인이 건 게 없으면 그대로 둠
    if (!owners || !owners.delete(owner)) return
    channelExclusionCount -= 1
    if (owners.size === 0) bySocket.delete(socketId)
    if (bySocket.size === 0) channelExclusions.delete(channelId)
    rearmExclusionAlarm()
}

// 연결 끊긴 소켓의 제외 전부 풀기 (모든 채널에서)
function releaseSocketFromAllChannels(socketId) {
    if (!isNonEmptyString(socketId)) return
    // 돌면서 지우려고 복사본으로 돎
    for (const [channelId, bySocket] of [...channelExclusions]) {
        const owners = bySocket.get(socketId)
        if (!owners) continue
        channelExclusionCount -= owners.size
        bySocket.delete(socketId)
        if (bySocket.size === 0) channelExclusions.delete(channelId)
    }
    rearmExclusionAlarm()
}

// 이 채널 방송에서 뺄 소켓 id 목록 (채널 방송이 씀)
function getChannelExclusions(channelId) {
    const bySocket = channelExclusions.get(channelId)
    return bySocket ? [...bySocket.keys()] : []
}

// 이 소켓이 이 채널 전달에서 빠졌는지 (주인 하나라도 걸었으면 빠짐)
function isSocketExcludedFromChannel(channelId, socketId) {
    return (channelExclusions.get(channelId)?.get(socketId)?.size ?? 0) > 0
}

// 시험용: 제외 기록·수 비우기 (경보 깃발·주인 번호는 그대로 둠)
function __resetChannelExclusionsForTests() {
    channelExclusions.clear()
    channelExclusionCount = 0
}

module.exports = {
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
    getChannelExclusions,
    isSocketExcludedFromChannel,
    __resetChannelExclusionsForTests,
}
