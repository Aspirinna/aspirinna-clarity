import momentData from '~/generated/moments.json'

export interface MomentItem {
	content: string
	createdAt: string
	images?: string[]
	location?: string
	tags?: string[]
}

export const moments = momentData as MomentItem[]
