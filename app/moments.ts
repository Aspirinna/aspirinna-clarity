export interface MomentItem {
	content: string
	createdAt: string
	images?: string[]
	location?: string
	tags?: string[]
}

export const moments: MomentItem[] = [
	{
		content: '博客的评论系统终于部署完成了...发一下好久之前的摄影测试一下。',
		createdAt: '2025-08-11T20:00:00+08:00',
		images: [
			'https://img.aspirinna.cloud/posts/20260811185228297.png',
		],
		location: '中国',
		tags: ['博客', 'Twikoo'],
	},
	{
		content: '开始学习 Nuxt 和 Vue。',
		createdAt: '2026-08-10T18:30:00+08:00',
		tags: ['Nuxt', '学习'],
	},
]
