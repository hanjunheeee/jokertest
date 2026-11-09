// 시험용 Redis 앞 TCP 중계 파일, Redis 죽음·멈춤을 진짜 Redis 그대로 둔 채 흉내 냄
// tests/cluster 통합 시험이 씀 (docker stop·pause보다 빠르고 다른 시험에 영향 없음)
const net = require('node:net')

// 중계 만들기: 받은 연결을 Redis로 그대로 넘김
// - kill(): 붙은 연결 전부 끊고 새 연결 거절 (Redis 프로세스 죽음과 같음)
// - freeze(): 연결은 두고 오가는 바이트를 멈춰 둠 (docker pause·네트워크 먹통과 같음, 풀면 밀린 것 감)
// - restore(): 다시 정상
async function createRedisProxy({ targetHost = '127.0.0.1', targetPort }) {
    let mode = 'ok'
    const pairs = new Set()

    const server = net.createServer((client) => {
        if (mode === 'dead') { client.destroy(); return }
        const upstream = net.connect(targetPort, targetHost)
        const pair = { client, upstream }
        pairs.add(pair)
        const drop = () => { pairs.delete(pair); client.destroy(); upstream.destroy() }
        client.on('error', drop)
        upstream.on('error', drop)
        client.on('close', drop)
        upstream.on('close', drop)
        client.pipe(upstream)
        upstream.pipe(client)
        if (mode === 'frozen') { client.pause(); upstream.pause() }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()

    const killAll = () => {
        for (const { client, upstream } of pairs) { client.destroy(); upstream.destroy() }
        pairs.clear()
    }

    return {
        port,
        url: `redis://127.0.0.1:${port}`,
        kill() { mode = 'dead'; killAll() },
        freeze() {
            mode = 'frozen'
            for (const { client, upstream } of pairs) { client.unpipe(upstream); upstream.unpipe(client); client.pause(); upstream.pause() }
        },
        restore() {
            const wasFrozen = mode === 'frozen'
            mode = 'ok'
            if (!wasFrozen) return
            for (const { client, upstream } of pairs) { client.pipe(upstream); upstream.pipe(client); client.resume(); upstream.resume() }
        },
        async close() {
            mode = 'dead'
            killAll()
            await new Promise((resolve) => server.close(() => resolve()))
        },
    }
}

module.exports = { createRedisProxy }
