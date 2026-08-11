import type { FeedGroup } from './types/feed'
import { myFeed } from '../blog.config'

export default [
	{
		name: '我的站点',
		desc: 'Aspirinna 的个人博客。',
		entries: [myFeed],
	},
	{
		name: '友链',
		desc: 'Aspirinna 的友链列表。',
		entries: [
			// {
			// 	author: 'AC丿official',
			// 	sitenick: 'Blibili',
			// 	title: '小众变态',
			// 	desc: '一个什么都可能会写的博客',
			// 	link: 'https://blog.guuguai.site/',
			// 	icon: 'https://cravatar.cn/avatar/646331BFF8F19A0E05679C3CC0FC54D6',
			// 	avatar: 'https://i0.hdslb.com/bfs/face/392afa692cf1bf579ff2a5ea53611a00807b8879.jpg',
			// 	archs: ['Nuxt', 'Netlify'],
			// 	date: '2023-12-23',
			// 	comment: 'deadlock老资历...',
			// },
		]
	}
] satisfies FeedGroup[]