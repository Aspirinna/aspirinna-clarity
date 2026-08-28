interface BiliItem {
	season_id: number
	media_id: number
	title: string
	cover: string
	evaluate?: string
	follow_status: number
	total_count?: number
	new_ep?: { index_show?: string }
	badge?: string
}

const PAGE_SIZE = 30
const MAX_PAGES = 40

export default defineEventHandler(async (event) => {
	const runtimeConfig = useRuntimeConfig(event)
	const uid = runtimeConfig.public?.biliUid
	const proxy = runtimeConfig.public?.biliApi

	if (!uid && !proxy)
		return { list: [] as BiliItem[], configured: false, failed: false, message: '' }

	function buildUrl(page: number) {
		if (proxy)
			return `${proxy}${proxy.includes('?') ? '&' : '?'}pn=${page}&ps=${PAGE_SIZE}`
		return `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&ps=${PAGE_SIZE}&pn=${page}`
	}

	const headers = {
		'Referer': 'https://www.bilibili.com',
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
	}

	try {
		const collected: BiliItem[] = []
		let total = Infinity
		for (let page = 1; page <= MAX_PAGES && collected.length < total; page++) {
			const response = await $fetch<{ code: number, message?: string, data?: { list?: BiliItem[], total?: number } }>(buildUrl(page), {
				headers,
				retry: 2,
				retryDelay: 1000,
				timeout: 30000,
			})
			if (response.code !== 0)
				return { list: collected, configured: true, failed: page === 1, message: response.message || `Bilibili API 错误 ${response.code}` }

			const pageList = response.data?.list ?? []
			total = response.data?.total ?? pageList.length
			collected.push(...pageList)
			if (!pageList.length)
				break
		}
		const uniqueList = [...new Map(collected.map(item => [item.media_id, item])).values()]
		return { list: uniqueList, configured: true, failed: false, message: '' }
	}
	catch {
		return { list: [] as BiliItem[], configured: true, failed: true, message: '无法连接 Bilibili API' }
	}
})
