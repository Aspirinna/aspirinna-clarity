export type ProjectRelation = 'created' | 'participation' | 'design' | 'using'

export interface ProjectItem {
	id: string
	name: string
	description: string
	link: string
	type?: string
	relation: ProjectRelation
	icon?: string
}
