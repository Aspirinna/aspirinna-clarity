import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(import.meta.url)
const baseDirectory = process.env.PUBLISH_BASE_DIR ?? '/opt/obsidian-publish'
const runsDirectory = `${baseDirectory}/runs`
const latestReadyFile = `${baseDirectory}/latest-ready`
const prepareUnit = 'obsidian-publish-prepare.service'
const runIdPattern = /^\d{8}T\d{6}Z-\d+$/

async function readOptional(path) {
	try {
		return (await readFile(path, 'utf8')).trim()
	}
	catch (error) {
		if (error?.code === 'ENOENT')
			return null
		throw error
	}
}

async function readPublishStatus() {
	const latest = await readOptional(latestReadyFile)
	if (!latest)
		return { exists: false }

	const runDirectory = await realpath(latest)
	const realRunsDirectory = await realpath(runsDirectory)
	if (!runDirectory.startsWith(`${realRunsDirectory}/`))
		throw new Error('Latest run is outside the runs directory')

	const runId = runDirectory.slice(realRunsDirectory.length + 1)
	if (!runIdPattern.test(runId))
		throw new Error('Latest run has an invalid identifier')

	return {
		exists: true,
		runId,
		status: await readOptional(`${runDirectory}/status`),
		summary: await readOptional(`${runDirectory}/summary.txt`),
		baseCommit: await readOptional(`${runDirectory}/base-commit`),
		publishCommit: await readOptional(`${runDirectory}/publish-commit`),
	}
}

async function runCommand(command, args, timeout = 10_000) {
	const result = await execFileAsync(command, args, {
		encoding: 'utf8',
		maxBuffer: 64 * 1024,
		timeout,
	})
	return result.stdout.trim()
}

async function internalStatus() {
	if (process.getuid?.() !== 0)
		throw new Error('internal-status must run as root')
	process.stdout.write(`${JSON.stringify(await readPublishStatus())}\n`)
}

async function internalStart(action, runId) {
	if (process.getuid?.() !== 0)
		throw new Error('internal-start must run as root')

	if (action === 'prepare') {
		await runCommand('/usr/bin/systemctl', ['start', '--no-block', prepareUnit])
		process.stdout.write('{"accepted":true,"action":"prepare"}\n')
		return
	}

	if (action !== 'publish' || !runIdPattern.test(runId ?? ''))
		throw new Error('Invalid internal action')

	const status = await readPublishStatus()
	if (!status.exists || status.runId !== runId || status.status !== 'ready')
		throw new Error('The requested run is no longer ready to publish')

	const unit = `obsidian-publish-publish@${runId}.service`
	await runCommand('/usr/bin/systemctl', ['start', '--no-block', unit])
	process.stdout.write(`${JSON.stringify({ accepted: true, action: 'publish', runId })}\n`)
}

async function privileged(arguments_) {
	const output = await runCommand('/usr/bin/sudo', [
		'-n',
		'/usr/bin/node',
		scriptPath,
		...arguments_,
	])
	return output ? JSON.parse(output) : null
}

async function unitStatus(unit) {
	try {
		const output = await runCommand('/usr/bin/systemctl', [
			'show',
			unit,
			'--property=ActiveState,SubState,Result,ExecMainStatus',
			'--no-pager',
		])
		return Object.fromEntries(output.split('\n').map((line) => {
			const index = line.indexOf('=')
			return [line.slice(0, index), line.slice(index + 1)]
		}))
	}
	catch {
		return { ActiveState: 'unknown' }
	}
}

function send(response, status, body) {
	const content = `${JSON.stringify(body)}\n`
	response.writeHead(status, {
		'cache-control': 'no-store',
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(content),
		'x-content-type-options': 'nosniff',
	})
	response.end(content)
}

async function readJson(request) {
	let size = 0
	const chunks = []
	for await (const chunk of request) {
		size += chunk.length
		if (size > 4096)
			throw new Error('Request body is too large')
		chunks.push(chunk)
	}
	if (!chunks.length)
		return {}
	return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function createAuthenticator(tokenHashes) {
	const expectedHashes = tokenHashes.split(',').map(value => value.trim()).filter(Boolean)
	if (!expectedHashes.length || expectedHashes.some(value => !/^[a-f\d]{64}$/i.test(value)))
		throw new Error('PUBLISH_API_TOKEN_SHA256S must contain SHA-256 hex digests')
	const expected = expectedHashes.map(value => Buffer.from(value, 'hex'))

	return (request) => {
		const authorization = request.headers.authorization ?? ''
		if (!authorization.startsWith('Bearer '))
			return false
		const actual = createHash('sha256').update(authorization.slice(7)).digest()
		return expected.some(hash => timingSafeEqual(actual, hash))
	}
}

async function serve() {
	const host = process.env.PUBLISH_API_HOST ?? '127.0.0.1'
	const port = Number.parseInt(process.env.PUBLISH_API_PORT ?? '8787', 10)
	const authenticate = createAuthenticator(process.env.PUBLISH_API_TOKEN_SHA256S ?? '')

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? '/', 'http://localhost')
			if (request.method === 'GET' && url.pathname === '/health') {
				send(response, 200, { ok: true })
				return
			}

			if (!authenticate(request)) {
				send(response, 401, { error: 'Unauthorized' })
				return
			}

			if (request.method === 'POST' && url.pathname === '/v1/prepare') {
				await privileged(['internal-start', 'prepare'])
				send(response, 202, { accepted: true, action: 'prepare' })
				return
			}

			if (request.method === 'GET' && url.pathname === '/v1/status') {
				const publish = await privileged(['internal-status'])
				const prepare = await unitStatus(prepareUnit)
				const publishUnit = publish?.runId
					? await unitStatus(`obsidian-publish-publish@${publish.runId}.service`)
					: null
				send(response, 200, { prepare, publishUnit, latest: publish })
				return
			}

			if (request.method === 'POST' && url.pathname === '/v1/publish') {
				const body = await readJson(request)
				if (typeof body.runId !== 'string' || !runIdPattern.test(body.runId)) {
					send(response, 400, { error: 'A valid runId is required' })
					return
				}
				await privileged(['internal-start', 'publish', body.runId])
				send(response, 202, { accepted: true, action: 'publish', runId: body.runId })
				return
			}

			send(response, 404, { error: 'Not found' })
		}
		catch (error) {
			console.error(error)
			send(response, 500, { error: 'Internal server error' })
		}
	})

	server.requestTimeout = 10_000
	server.headersTimeout = 12_000
	server.listen(port, host, () => {
		process.stdout.write(`Publish API listening on http://${host}:${port}\n`)
	})
}

async function main() {
	const command = process.argv[2]
	if (command === 'serve')
		await serve()
	else if (command === 'internal-status')
		await internalStatus()
	else if (command === 'internal-start')
		await internalStart(process.argv[3], process.argv[4])
	else
		throw new Error('Usage: server.mjs serve|internal-status|internal-start')
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
