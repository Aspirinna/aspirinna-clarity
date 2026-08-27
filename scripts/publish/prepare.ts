import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import YAML from 'yaml'

interface PreparedPost {
	path: string
	content: string
}

const [vaultArgument, outputArgument] = process.argv.slice(2)

if (!vaultArgument || !outputArgument)
	throw new Error('用法：pnpm publish:prepare <Vault路径> <输出路径>')

const blogDirectory = resolve(vaultArgument, 'Blog')
const outputDirectory = resolve(outputArgument)

async function listMarkdown(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const groups = await Promise.all(entries.map(async (entry) => {
		const path = join(directory, entry.name)
		if (entry.isDirectory())
			return listMarkdown(path)
		return entry.isFile() && extname(entry.name) === '.md' ? [path] : []
	}))
	return groups.flat().sort()
}

function requireText(data: Record<string, unknown>, key: string, sourcePath: string): string {
	const value = data[key]
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${sourcePath} 的 ${key} 不能为空`)
	return value.trim()
}

const prepared: PreparedPost[] = []
const targets = new Set<string>()

for (const sourcePath of await listMarkdown(blogDirectory)) {
	const raw = await readFile(sourcePath, 'utf8')
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
	if (!match)
		throw new Error(`缺少 Frontmatter：${sourcePath}`)

	const parsed: unknown = YAML.parse(match[1])
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new Error(`Frontmatter 不是对象：${sourcePath}`)
	const data = parsed as Record<string, unknown>

	if (data.channel !== 'blog' || data.publish !== true || data.draft !== false)
		continue

	const title = requireText(data, 'title', sourcePath)
	const description = requireText(data, 'description', sourcePath)
	const date = requireText(data, 'date', sourcePath)
	const slug = requireText(data, 'slug', sourcePath)

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
		throw new Error(`${sourcePath} 的 slug 只能使用小写字母、数字和连字符`)
	const year = date.match(/^(\d{4})-/)?.[1]
	if (!year)
		throw new Error(`${sourcePath} 的 date 格式不正确`)
	if (!Array.isArray(data.categories) || !data.categories.length || data.categories.some(value => typeof value !== 'string'))
		throw new Error(`${sourcePath} 至少需要一个字符串类型的 categories`)
	if (!Array.isArray(data.tags) || data.tags.some(value => typeof value !== 'string'))
		throw new Error(`${sourcePath} 的 tags 必须是字符串数组`)
	if (data.type !== 'tech' && data.type !== 'story')
		throw new Error(`${sourcePath} 的 type 必须是 tech 或 story`)

	const frontmatter = Object.fromEntries(Object.entries({
		title,
		description,
		date,
		updated: data.updated,
		published: data.published,
		categories: data.categories,
		tags: data.tags,
		type: data.type,
		image: data.image,
		recommend: data.recommend,
		references: data.references,
		draft: false,
		permalink: data.permalink,
	}).filter(([, value]) => value !== null && value !== undefined && value !== ''))

	const targetPath = join(outputDirectory, year, `${slug}.md`)
	if (targets.has(targetPath))
		throw new Error(`存在重复的发布目标：${targetPath}`)
	targets.add(targetPath)

	const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd()
	const body = raw.slice(match[0].length).trim()
	prepared.push({ path: targetPath, content: `---\n${yaml}\n---\n\n${body}\n` })
}

if (!prepared.length)
	throw new Error('没有找到同时满足 publish: true 和 draft: false 的博客文章')

await mkdir(outputDirectory)
for (const item of prepared) {
	await mkdir(dirname(item.path), { recursive: true })
	await writeFile(item.path, item.content, 'utf8')
	console.log(`已生成：${item.path}`)
}
