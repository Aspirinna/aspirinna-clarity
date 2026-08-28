import { Buffer } from 'node:buffer'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import process from 'node:process'

const STEAM_API_BASE = 'https://api.steampowered.com'
const STEAM_CDN_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'

const config = {
	apiKey: process.env.STEAM_API_KEY?.trim(),
	steamId: process.env.STEAM_ID?.trim(),
	host: process.env.HOST || '0.0.0.0',
	port: readPositiveInteger('PORT', 8788),
	cacheFile: process.env.CACHE_FILE || '/data/dashboard.json',
	activeRefreshMs: readPositiveInteger('ACTIVE_REFRESH_MINUTES', 10) * 60_000,
	libraryRefreshMs: readPositiveInteger('LIBRARY_REFRESH_MINUTES', 60) * 60_000,
	requestTimeoutMs: readPositiveInteger('REQUEST_TIMEOUT_SECONDS', 20) * 1000,
	recentAchievementLimit: readPositiveInteger('RECENT_ACHIEVEMENT_LIMIT', 5),
}

if (!config.apiKey)
	throw new Error('STEAM_API_KEY is required')
if (!/^\d{17}$/.test(config.steamId || ''))
	throw new Error('STEAM_ID must be a 17-digit Steam ID64')

const state = {
	summary: null,
	steamLevel: undefined,
	badgeCount: undefined,
	xp: undefined,
	recentGames: [],
	games: [],
	activityUpdatedAt: 0,
	libraryUpdatedAt: 0,
}

let activityRefreshPromise
let libraryRefreshPromise

function readPositiveInteger(name, fallback) {
	const value = Number.parseInt(process.env[name] || '', 10)
	return Number.isFinite(value) && value > 0 ? value : fallback
}

function log(message) {
	process.stdout.write(`${message}\n`)
}

function formatIsoTimestamp(unixSeconds) {
	return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : undefined
}

function statusText(personaState, gameName) {
	if (gameName)
		return `正在玩 ${gameName}`
	return {
		0: '离线',
		1: '在线',
		2: '忙碌',
		3: '离开',
		4: '暂离',
		5: '正在寻找交易',
		6: '正在寻找游戏',
	}[personaState] || '状态未知'
}

function gameHeaderUrl(appId) {
	return `${STEAM_CDN_BASE}/${appId}/header.jpg`
}

function mapGame(game) {
	return {
		appId: game.appid,
		name: game.name || `App ${game.appid}`,
		headerImageUrl: gameHeaderUrl(game.appid),
		playtimeMinutes: game.playtime_forever || 0,
		playtime2WeeksMinutes: game.playtime_2weeks,
		lastPlayedAt: formatIsoTimestamp(game.rtime_last_played),
	}
}

function dashboard({ stale = false } = {}) {
	const totalPlaytimeMinutes = state.games.reduce((total, game) => total + game.playtimeMinutes, 0)
	const recentPlaytimeMinutes = state.recentGames.reduce((total, game) => total + (game.playtime2WeeksMinutes || 0), 0)
	const hasData = Boolean(state.summary || state.games.length || state.recentGames.length)
	const updatedAt = Math.max(state.activityUpdatedAt, state.libraryUpdatedAt)

	return {
		configured: true,
		failed: !hasData,
		stale,
		updatedAt: updatedAt ? new Date(updatedAt).toISOString() : undefined,
		profile: state.summary
			? {
					steamId: state.summary.steamid,
					personaName: state.summary.personaname,
					profileUrl: state.summary.profileurl,
					avatarFull: state.summary.avatarfull,
					statusText: statusText(state.summary.personastate, state.summary.gameextrainfo),
					lastOnline: formatIsoTimestamp(state.summary.lastlogoff),
					steamLevel: state.steamLevel,
					badgeCount: state.badgeCount,
					xp: state.xp,
				}
			: undefined,
		stats: {
			totalGames: state.games.length,
			totalPlaytimeMinutes,
			recentPlaytimeMinutes,
		},
		recentGames: state.recentGames,
		games: state.games,
	}
}

async function steamRequest(path, parameters = {}) {
	const url = new URL(path, STEAM_API_BASE)
	url.search = new URLSearchParams({
		key: config.apiKey,
		steamid: config.steamId,
		format: 'json',
		...parameters,
	}).toString()

	const response = await fetch(url, {
		headers: { 'User-Agent': 'Aspirinna-Steam-Dashboard/0.1' },
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	})
	if (!response.ok)
		throw new Error(`Steam API ${path} returned HTTP ${response.status}`)
	return response.json()
}

async function getAchievementProgress(appId) {
	try {
		const result = await steamRequest('/ISteamUserStats/GetPlayerAchievements/v1/', {
			appid: String(appId),
			l: 'schinese',
		})
		const achievements = result.playerstats?.achievements
		if (!Array.isArray(achievements))
			return undefined
		return {
			unlocked: achievements.filter(item => item.achieved === 1).length,
			total: achievements.length,
		}
	}
	catch {
		return undefined
	}
}

async function refreshActivity(force = false) {
	if (!force && Date.now() - state.activityUpdatedAt < config.activeRefreshMs)
		return
	if (activityRefreshPromise)
		return activityRefreshPromise

	activityRefreshPromise = (async () => {
		const [summaryResult, recentResult] = await Promise.all([
			steamRequest('/ISteamUser/GetPlayerSummaries/v2/', { steamids: config.steamId }),
			steamRequest('/IPlayerService/GetRecentlyPlayedGames/v1/', { count: '20' }),
		])

		const summary = summaryResult.response?.players?.[0]
		if (!summary)
			throw new Error('Steam profile is unavailable; check Steam ID and privacy settings')

		const recentGames = (recentResult.response?.games || []).map(mapGame)
		const gamesWithAchievements = await Promise.all(recentGames.map(async (game, index) => ({
			...game,
			achievements: index < config.recentAchievementLimit
				? await getAchievementProgress(game.appId)
				: undefined,
		})))

		state.summary = summary
		state.recentGames = gamesWithAchievements
		state.activityUpdatedAt = Date.now()
		await saveCache()
	})().finally(() => {
		activityRefreshPromise = undefined
	})

	return activityRefreshPromise
}

async function refreshLibrary(force = false) {
	if (!force && Date.now() - state.libraryUpdatedAt < config.libraryRefreshMs)
		return
	if (libraryRefreshPromise)
		return libraryRefreshPromise

	libraryRefreshPromise = (async () => {
		const [gamesResult, levelResult, badgesResult] = await Promise.all([
			steamRequest('/IPlayerService/GetOwnedGames/v1/', {
				include_appinfo: 'true',
				include_played_free_games: 'true',
			}),
			steamRequest('/IPlayerService/GetSteamLevel/v1/'),
			steamRequest('/IPlayerService/GetBadges/v1/'),
		])

		const ownedGames = gamesResult.response?.games
		if (!Array.isArray(ownedGames))
			throw new Error('Steam game details are unavailable; make Game details public')

		state.games = ownedGames
			.map(mapGame)
			.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)
		state.steamLevel = levelResult.response?.player_level
		state.badgeCount = badgesResult.response?.badges?.length || 0
		state.xp = badgesResult.response?.player_xp
		state.libraryUpdatedAt = Date.now()
		await saveCache()
	})().finally(() => {
		libraryRefreshPromise = undefined
	})

	return libraryRefreshPromise
}

async function refreshDashboard(force = false) {
	const results = await Promise.allSettled([
		refreshActivity(force),
		refreshLibrary(force),
	])
	const failed = results.filter(result => result.status === 'rejected')
	for (const result of failed)
		console.error(`[steam-api] refresh failed: ${result.reason?.message || result.reason}`)
	return dashboard({ stale: failed.length > 0 })
}

async function loadCache() {
	try {
		const cached = JSON.parse(await readFile(config.cacheFile, 'utf8'))
		for (const key of Object.keys(state)) {
			if (cached[key] !== undefined)
				state[key] = cached[key]
		}
		log(`[steam-api] loaded cache from ${config.cacheFile}`)
	}
	catch (error) {
		if (error.code !== 'ENOENT')
			console.warn(`[steam-api] cache load failed: ${error.message}`)
	}
}

async function saveCache() {
	const directory = dirname(config.cacheFile)
	const temporaryFile = `${config.cacheFile}.tmp`
	await mkdir(directory, { recursive: true })
	await writeFile(temporaryFile, JSON.stringify(state), { mode: 0o600 })
	await rename(temporaryFile, config.cacheFile)
}

function sendJson(response, statusCode, body) {
	const payload = JSON.stringify(body)
	response.writeHead(statusCode, {
		'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
		'Content-Length': Buffer.byteLength(payload),
		'Content-Type': 'application/json; charset=utf-8',
		'X-Content-Type-Options': 'nosniff',
	})
	response.end(payload)
}

async function main() {
	await loadCache()

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
			if (request.method !== 'GET') {
				sendJson(response, 405, { error: 'Method not allowed' })
				return
			}

			if (url.pathname === '/health') {
				sendJson(response, 200, {
					ok: true,
					hasProfileCache: Boolean(state.summary),
					hasLibraryCache: state.games.length > 0,
				})
				return
			}

			if (url.pathname === '/v1/dashboard') {
				sendJson(response, 200, await refreshDashboard())
				return
			}

			sendJson(response, 404, { error: 'Not found' })
		}
		catch (error) {
			console.error(`[steam-api] request failed: ${error.message}`)
			sendJson(response, 500, { error: 'Internal server error' })
		}
	})

	server.listen(config.port, config.host, () => {
		log(`[steam-api] listening on http://${config.host}:${config.port}`)
		log(`[steam-api] Steam ID: ${config.steamId}`)
	})

	const timer = setInterval(() => {
		refreshDashboard().catch(error => console.error(`[steam-api] scheduled refresh failed: ${error.message}`))
	}, 60_000)
	timer.unref()

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			server.close(() => process.exit(0))
		})
	}
}

main().catch((error) => {
	console.error(`[steam-api] startup failed: ${error.message}`)
	process.exitCode = 1
})
