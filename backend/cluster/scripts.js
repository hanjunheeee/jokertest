// Redis Lua 글 모음 파일, 여러 명령을 한 번에(중간에 끼어들기 없이) 돌릴 때 씀
// cluster/redis.js가 연결마다 defineCommand로 붙임, 같은 동작의 메모리판은 testing/memoryCluster.js

// 값의 node가 나일 때만 지움 (JSON이면 node·bootEpoch, 글자면 그 글자) → 옛 Node가 새 값을 안 지움
const DEL_IF_OWNER = `
local v = redis.call('GET', KEYS[1])
if not v then return 0 end
local mine = (v == ARGV[1])
if not mine then
  local ok, obj = pcall(cjson.decode, v)
  if ok and type(obj) == 'table' and obj.node == ARGV[1] then
    mine = (ARGV[2] == '' or obj.bootEpoch == nil or obj.bootEpoch == ARGV[2])
  end
end
if not mine then return 0 end
redis.call('DEL', KEYS[1])
if KEYS[2] then redis.call('HDEL', KEYS[2], KEYS[1]) end
return 1`;

// 값이 똑같을 때만 지움
const DEL_IF_EQUALS = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
if KEYS[2] then redis.call('HDEL', KEYS[2], KEYS[1]) end
return 1`;

// 쓰기 + 이 Node가 쓴 키 목록(hash: 키 → 쓴 값)에 남김, nx면 이미 있을 때 0
const WRITE_TRACKED = `
if ARGV[3] == '1' and redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('HSET', KEYS[2], KEYS[1], ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return 1`;

// 켤 때 정리: 목록의 키가 아직 그때 쓴 값 그대로면 지움 (다른 Node가 덮은 건 안 건드림)
const CLEANUP_TRACKED = `
local all = redis.call('HGETALL', KEYS[1])
local n = 0
for i = 1, #all, 2 do
  if redis.call('GET', all[i]) == all[i + 1] then redis.call('DEL', all[i]); n = n + 1 end
end
redis.call('DEL', KEYS[1])
return n`;

// 창 카운터: 늘리고 처음이면(또는 수명 없으면) 창 길이 수명 → {횟수, 남은 ms}
const INCR_WINDOW = `
local n = redis.call('INCR', KEYS[1])
if n == 1 or redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('PTTL', KEYS[1])}`;

// 순번: 늘리고 수명 다시 (connseq 등)
const INCR_TTL = `
local n = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return n`;

// 카운터 보기: {횟수 글자 또는 false, 남은 ms}
const PEEK = `return {redis.call('GET', KEYS[1]), redis.call('PTTL', KEYS[1])}`;

// 하트비트: 전에 있었는지·전 bootEpoch를 돌려주고 hash 덮어쓰기 + 수명 + nodes 집합에 넣기
const HEARTBEAT = `
local existed = redis.call('EXISTS', KEYS[1])
local prev = redis.call('HGET', KEYS[1], 'bootEpoch') or ''
redis.call('HSET', KEYS[1], unpack(ARGV, 3))
redis.call('PEXPIRE', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[2], ARGV[2])
return {existed, prev}`;

const SCRIPTS = Object.freeze({
    mmcDelIfOwner: DEL_IF_OWNER,
    mmcDelIfEquals: DEL_IF_EQUALS,
    mmcWriteTracked: WRITE_TRACKED,
    mmcCleanupTracked: CLEANUP_TRACKED,
    mmcIncrWindow: INCR_WINDOW,
    mmcIncrTtl: INCR_TTL,
    mmcPeek: PEEK,
    mmcHeartbeat: HEARTBEAT,
});

module.exports = { SCRIPTS };
