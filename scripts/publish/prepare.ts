import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import YAML from 'yaml'

interface PreparedFile {
	path: string
	content: string
}

interface MomentItem {
	content: string
	createdAt: string
	images?: string[]
	location?: string
	tags?: string[]
}

type ProjectRelation = 'created' | 'participation' | 'design' | 'using'

interface ProjectItem {
	id: string
	name: string
	description: string
	link: string
	type?: string
	relation: ProjectRelation
	icon?: string
}

interface ParsedMarkdown {
	body: string
	data: Record<string, unknown>
	path: string
}

const [vaultArgument, outputArgument] = process.argv.slice(2)

if (!vaultArgument || !outputArgument)
	throw new Error('用法：pnpm publish:prepare <Vault路径> <输出路径>')

const vaultDirectory = resolve(vaultArgument)
const outputDirectory = resolve(outputArgument)

async function listMarkdown(directory: string): Promise<string[]> {
	let entries
	try {
		entries = await readdir(directory, { withFileTypes: true })
	}
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return []
		throw error
	}
	const groups = await Promise.all(entries.map(async (entry) => {
		const path = join(directory, entry.name)
		if (entry.isDirectory())
			return listMarkdown(path)
		return entry.isFile() && extname(entry.name).toLowerCase() === '.md' ? [path] : []
	}))
	return groups.flat().sort()
}

async function parseMarkdown(path: string): Promise<ParsedMarkdown> {
	const raw = await readFile(path, 'utf8')
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
	if (!match)
		throw new Error(`缺少 Frontmatter：${path}`)

	const parsed: unknown = YAML.parse(match[1])
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new Error(`Frontmatter 不是对象：${path}`)
	return {
		body: raw.slice(match[0].length).trim(),
		data: parsed as Record<string, unknown>,
		path,
	}
}

function requireText(data: Record<string, unknown>, key: string, sourcePath: string): string {
	const value = data[key]
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${sourcePath} 的 ${key} 不能为空`)
	return value.trim()
}

function optionalText(data: Record<string, unknown>, key: string, sourcePath: string): string | undefined {
	const value = data[key]
	if (value === null || value === undefined || value === '')
		return undefined
	if (typeof value !== 'string')
		throw new TypeError(`${sourcePath} 的 ${key} 必须是字符串`)
	return value.trim() || undefined
}

function stringList(data: Record<string, unknown>, key: string, sourcePath: string, required = false): string[] {
	const value = data[key]
	if (value === null || value === undefined) {
		if (required)
			throw new Error(`${sourcePath} 的 ${key} 至少需要一项`)
		return []
	}
	if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim()))
		throw new TypeError(`${sourcePath} 的 ${key} 必须是字符串数组`)
	if (required && !value.length)
		throw new Error(`${sourcePath} 的 ${key} 至少需要一项`)
	return value.map(item => (item as string).trim())
}

function shouldPublish(data: Record<string, unknown>, channel: string): boolean {
	return data.channel === channel && data.publish === true && data.draft === false
}

function assertIsoDate(value: string, key: string, sourcePath: string): void {
	if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)))
		throw new Error(`${sourcePath} 的 ${key} 必须是带时区的 ISO 日期时间`)
}

function toJson(value: unknown): string {
	return JSON.stringify(value, null, 2)
}

async function preparePosts(sourceFiles: string[]): Promise<PreparedFile[]> {
	const prepared: PreparedFile[] = []
	const targets = new Set<string>()
	for (const sourcePath of sourceFiles) {
		const { body, data } = await parseMarkdown(sourcePath)
		if (!shouldPublish(data, 'blog'))
			continue

		const title = requireText(data, 'title', sourcePath)
		const description = requireText(data, 'description', sourcePath)
		const date = requireText(data, 'date', sourcePath)
		const slug = requireText(data, 'slug', sourcePath)
		if (!/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date)))
			throw new Error(`${sourcePath} 的 date 格式不正确`)
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
			throw new Error(`${sourcePath} 的 slug 只能使用小写字母、数字和连字符`)
		if (data.type !== 'tech' && data.type !== 'story')
			throw new Error(`${sourcePath} 的 type 必须是 tech 或 story`)

		const categories = stringList(data, 'categories', sourcePath, true)
		const tags = stringList(data, 'tags', sourcePath)
		const year = date.slice(0, 4)
		const frontmatter = Object.fromEntries(Object.entries({
			title,
			description,
			date,
			updated: data.updated,
			published: data.published,
			categories,
			tags,
			type: data.type,
			image: data.image,
			recommend: data.recommend,
			references: data.references,
			draft: false,
			permalink: data.permalink,
		}).filter(([, value]) => value !== null && value !== undefined && value !== ''))

		const targetPath = join(outputDirectory, 'content', 'posts', year, `${slug}.md`)
		if (targets.has(targetPath))
			throw new Error(`存在重复的博客发布目标：${targetPath}`)
		targets.add(targetPath)
		const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd()
		prepared.push({ path: targetPath, content: `---\n${yaml}\n---\n\n${body}\n` })
	}
	if (!prepared.length)
		throw new Error('Blog 中没有找到同时满足 channel: blog、publish: true 和 draft: false 的文章')
	return prepared
}

async function prepareMoments(sourceFiles: string[]): Promise<MomentItem[]> {
	const moments: MomentItem[] = []
	const timestamps = new Set<string>()
	for (const sourcePath of sourceFiles) {
		const { body, data } = await parseMarkdown(sourcePath)
		if (!shouldPublish(data, 'moment'))
			continue
		const createdAt = requireText(data, 'createdAt', sourcePath)
		assertIsoDate(createdAt, 'createdAt', sourcePath)
		if (!body)
			throw new Error(`${sourcePath} 的正文不能为空`)
		if (timestamps.has(createdAt))
			throw new Error(`即刻动态的 createdAt 重复：${createdAt}`)
		timestamps.add(createdAt)

		const images = stringList(data, 'images', sourcePath)
		const tags = stringList(data, 'tags', sourcePath)
		const location = optionalText(data, 'location', sourcePath)
		moments.push({
			content: body,
			createdAt,
			...(images.length ? { images } : {}),
			...(location ? { location } : {}),
			...(tags.length ? { tags } : {}),
		})
	}
	return moments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

async function prepareProjects(sourceFiles: string[]): Promise<ProjectItem[]> {
	const projects: ProjectItem[] = []
	const ids = new Set<string>()
	const relations: ProjectRelation[] = ['created', 'participation', 'design', 'using']
	for (const sourcePath of sourceFiles) {
		const { data } = await parseMarkdown(sourcePath)
		if (!shouldPublish(data, 'project'))
			continue
		const id = requireText(data, 'id', sourcePath)
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
			throw new Error(`${sourcePath} 的 id 只能使用小写字母、数字和连字符`)
		if (ids.has(id))
			throw new Error(`项目 id 重复：${id}`)
		ids.add(id)
		const relation = requireText(data, 'relation', sourcePath) as ProjectRelation
		if (!relations.includes(relation))
			throw new Error(`${sourcePath} 的 relation 必须是 ${relations.join('、')} 之一`)
		const type = optionalText(data, 'type', sourcePath)
		const icon = optionalText(data, 'icon', sourcePath)
		projects.push({
			id,
			name: requireText(data, 'name', sourcePath),
			description: requireText(data, 'description', sourcePath),
			link: requireText(data, 'link', sourcePath),
			relation,
			...(type ? { type } : {}),
			...(icon ? { icon } : {}),
		})
	}
	return projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

const blogSources = await listMarkdown(join(vaultDirectory, 'Blog'))
const momentSources = await listMarkdown(join(vaultDirectory, 'Moments'))
const projectSources = await listMarkdown(join(vaultDirectory, 'Projects'))
if (!blogSources.length)
	throw new Error('Vault 中没有找到 Blog/*.md')
if (!momentSources.length)
	throw new Error('Vault 中没有找到 Moments/*.md；请先创建一篇即刻或占位草稿')
if (!projectSources.length)
	throw new Error('Vault 中没有找到 Projects/*.md；请先创建一个项目或占位草稿')

const posts = await preparePosts(blogSources)
const moments = await prepareMoments(momentSources)
const projects = await prepareProjects(projectSources)
const prepared: PreparedFile[] = [
	...posts,
	{ path: join(outputDirectory, 'app', 'generated', 'moments.json'), content: toJson(moments) },
	{ path: join(outputDirectory, 'app', 'generated', 'projects.json'), content: toJson(projects) },
]

await mkdir(outputDirectory, { recursive: true })
for (const item of prepared) {
	await mkdir(dirname(item.path), { recursive: true })
	await writeFile(item.path, item.content, 'utf8')
	console.log(`已生成：${item.path}`)
}
console.log(`发布快照：博客 ${posts.length} 篇，即刻 ${moments.length} 条，项目 ${projects.length} 个`)
