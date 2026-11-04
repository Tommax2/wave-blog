import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import Story from './models/Story.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const dataDir = join(root, 'data')
const uploadDir = join(root, 'uploads')
const port = Number(process.env.PORT || 4000)
const adminPassword = process.env.ADMIN_PASSWORD
const mongodbUri = process.env.MONGODB_URI
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const sessions = new Map()

if (!adminPassword || adminPassword.length < 12) {
  throw new Error('ADMIN_PASSWORD must be set and contain at least 12 characters.')
}
if (!mongodbUri) throw new Error('MONGODB_URI must be set before starting the server.')

await mkdir(dataDir, { recursive: true })
await mkdir(uploadDir, { recursive: true })
await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 })
mongoose.connection.on('error', error => console.error('MongoDB connection error:', error))

if (await Story.countDocuments() === 0) {
  try {
    const seeds = JSON.parse(await readFile(join(dataDir, 'stories.json'), 'utf8'))
    if (seeds.length) await Story.insertMany(seeds)
  } catch (error) { console.warn('Initial stories were not imported:', error.message) }
}

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}
const cors = res => {
  res.setHeader('Access-Control-Allow-Origin', frontendOrigin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
}
const body = req => new Promise((resolve, reject) => {
  let raw = ''
  let size = 0
  let rejected = false
  req.on('data', chunk => {
    if (rejected) return
    size += chunk.length
    if (size > 20_000_000) {
      rejected = true
      reject(new Error('Request is too large. Please use an image smaller than 10 MB.'))
      return
    }
    raw += chunk
  })
  req.on('end', () => { if (rejected) return; try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('Invalid JSON')) } })
  req.on('error', reject)
})
const authorized = req => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const expires = sessions.get(token)
  if (!expires || expires < Date.now()) { if (token) sessions.delete(token); return false }
  return true
}
const saveImage = async dataUrl => {
  if (!dataUrl) return ''
  if (!dataUrl.startsWith('data:image/')) return dataUrl
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/)
  if (!match) throw new Error('Unsupported image format')
  return dataUrl
}
const normalize = (input, existing = {}) => ({
  ...(typeof existing.toObject === 'function' ? existing.toObject() : existing),
  title: String(input.title || '').trim(),
  category: String(input.category || '').trim(),
  excerpt: String(input.excerpt || '').trim(),
  author: String(input.author || 'WAVE Editorial').trim(),
  date: String(input.date || new Date().toISOString().slice(0, 10)),
  body: Array.isArray(input.body) ? input.body.map(String).filter(Boolean) : String(input.body || '').split(/\n\s*\n/).map(value => value.trim()).filter(Boolean),
  published: Boolean(input.published),
})

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return res.end()
  const url = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const input = await body(req)
      if (input.password !== adminPassword) return json(res, 401, { error: 'Incorrect password' })
      const token = randomBytes(32).toString('hex')
      sessions.set(token, Date.now() + 12 * 60 * 60 * 1000)
      return json(res, 200, { token })
    }

    if (url.pathname === '/api/stories' && req.method === 'GET') {
      const filter = authorized(req) ? {} : { published: true }
      const stories = await Story.find(filter).sort({ date: -1, createdAt: -1 })
      return json(res, 200, stories)
    }

    if (url.pathname === '/api/stories' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' })
      const input = await body(req)
      const story = normalize(input)
      if (!story.title || !story.category || !story.excerpt || !story.body.length) return json(res, 400, { error: 'Complete all required fields' })
      story.id = `${story.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
      story.image = await saveImage(input.image)
      story.createdAt = new Date().toISOString()
      story.updatedAt = story.createdAt
      const created = await Story.create(story)
      return json(res, 201, created)
    }

    const match = url.pathname.match(/^\/api\/stories\/([^/]+)$/)
    if (match && req.method === 'PUT') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' })
      const previous = await Story.findOne({ id: decodeURIComponent(match[1]) })
      if (!previous) return json(res, 404, { error: 'Story not found' })
      const input = await body(req)
      const updated = normalize(input, previous)
      if (input.image?.startsWith('data:image/')) updated.image = await saveImage(input.image)
      else updated.image = input.image || previous.image
      const saved = await Story.findOneAndUpdate({ id: previous.id }, updated, { new: true, runValidators: true })
      return json(res, 200, saved)
    }

    if (match && req.method === 'DELETE') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' })
      const removed = await Story.findOneAndDelete({ id: decodeURIComponent(match[1]) })
      if (!removed) return json(res, 404, { error: 'Story not found' })
      return json(res, 200, { ok: true })
    }

    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/admin' })
      return res.end()
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      const adminRoot = resolve(root, 'public', 'admin')
      const relative = url.pathname === '/admin' || url.pathname === '/admin/' ? 'index.html' : url.pathname.slice('/admin/'.length)
      let file = resolve(adminRoot, relative)
      if (!file.startsWith(adminRoot)) return json(res, 403, { error: 'Forbidden' })
      try {
        const content = await readFile(file)
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
        res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream' })
        return res.end(content)
      } catch { return json(res, 404, { error: 'Admin asset not found' }) }
    }

    if (url.pathname.startsWith('/uploads/')) {
      const file = join(uploadDir, basename(url.pathname.slice('/uploads/'.length)))
      const content = await readFile(file)
      const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
      res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' })
      return res.end(content)
    }

    if (url.pathname === '/health') return json(res, mongoose.connection.readyState === 1 ? 200 : 503, { ok: mongoose.connection.readyState === 1, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
    json(res, 404, { error: 'Not found' })
  } catch (error) {
    json(res, 500, { error: error.message || 'Server error' })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`WAVE backend running on port ${port}`))

const shutdown = async () => { await mongoose.disconnect(); server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
