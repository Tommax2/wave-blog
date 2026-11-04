import { useEffect, useState } from 'react'

const blank = () => ({ id: '', title: '', category: '', excerpt: '', author: 'WAVE Editorial', date: new Date().toISOString().slice(0, 10), body: '', published: true, image: '' })
const api = '/api'

async function compressImage(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .82)
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('waveToken') || '')
  const [password, setPassword] = useState('')
  const [stories, setStories] = useState([])
  const [form, setForm] = useState(blank)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const request = async (path, options = {}) => {
    const response = await fetch(api + path, { ...options, headers: { ...headers, ...options.headers } })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) { sessionStorage.removeItem('waveToken'); setToken(''); throw new Error('Your session expired. Please sign in again.') }
    if (!response.ok) throw new Error(data.error || 'Request failed.')
    return data
  }
  const load = async () => { try { setStories(await request('/stories')) } catch (error) { setMessage(error.message) } }
  useEffect(() => { if (token) load() }, [token])

  const login = async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try { const data = await fetch(api + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data }); sessionStorage.setItem('waveToken', data.token); setToken(data.token) }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const chooseImage = async event => {
    const file = event.target.files?.[0]; if (!file) return
    setBusy(true); setMessage('Optimising image…')
    try { const image = await compressImage(file); setForm(current => ({ ...current, image })); setMessage(`Image ready (${Math.round(image.length / 1024)} KB).`) }
    catch (error) { setMessage(error.message); event.target.value = '' } finally { setBusy(false) }
  }
  const save = async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try { const payload = { ...form, body: form.body.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean) }; await request('/stories' + (form.id ? `/${encodeURIComponent(form.id)}` : ''), { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); setForm(blank()); setMessage('Story saved successfully.'); await load() }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const edit = story => { setForm({ ...story, date: story.date.slice(0, 10), body: story.body.join('\n\n') }); scrollTo({ top: 0, behavior: 'smooth' }) }
  const remove = async story => { if (!confirm(`Delete “${story.title}” permanently?`)) return; setBusy(true); try { await request(`/stories/${encodeURIComponent(story.id)}`, { method: 'DELETE' }); setMessage('Story deleted.'); await load() } catch (error) { setMessage(error.message) } finally { setBusy(false) } }

  if (!token) return <main className="login"><form className="login-card" onSubmit={login}><span className="brand">WAVE</span><h1>Story Studio</h1><p>Sign in to manage the stories on your website.</p><label>Admin password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoFocus /></label>{message && <div className="notice error">{message}</div>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>

  return <div className="shell"><aside><span className="brand">WAVE</span><h2>Story Studio</h2><p>Create, edit, publish and remove stories.</p><button onClick={() => setForm(blank())}>New story</button><button className="quiet" onClick={() => { sessionStorage.removeItem('waveToken'); setToken('') }}>Sign out</button></aside><main className="main"><header><div><span className="eyebrow">EDITORIAL ADMIN</span><h1>Stories</h1><p>Published stories appear on the website automatically.</p></div><strong>{stories.length} stories</strong></header>{message && <div className="notice">{message}</div>}<div className="grid"><form className="panel editor" onSubmit={save}><h2>{form.id ? 'Edit story' : 'Add a story'}</h2><div className="fields"><label>Title<input name="title" value={form.title} onChange={change} required /></label><label>Category<input name="category" value={form.category} onChange={change} required /></label><label className="wide">Excerpt<textarea name="excerpt" rows="3" value={form.excerpt} onChange={change} required /></label><label>Author<input name="author" value={form.author} onChange={change} required /></label><label>Date<input name="date" type="date" value={form.date} onChange={change} required /></label><label className="wide">Story image<input type="file" accept="image/*" onChange={chooseImage} /><small>Images are automatically resized and compressed. Maximum original size: 10 MB.</small>{form.image && <img className="preview" src={form.image} alt="Story preview" />}</label><label className="wide">Story body<textarea name="body" rows="13" value={form.body} onChange={change} required /><small>Leave a blank line between paragraphs.</small></label><label className="check wide"><input name="published" type="checkbox" checked={form.published} onChange={change} /> Publish on website</label></div><div className="actions"><button disabled={busy}>{busy ? 'Working…' : 'Save story'}</button><button type="button" className="secondary" onClick={() => setForm(blank())}>Clear</button></div></form><section className="panel list"><h2>All stories</h2>{stories.map(story => <article key={story.id}>{story.image && <img src={story.image} alt="" />}<div><span className={story.published ? 'status live' : 'status'}>{story.published ? 'Published' : 'Draft'}</span><h3>{story.title}</h3><small>{story.category} · {story.date}</small><div className="story-actions"><button onClick={() => edit(story)}>Edit</button><button className="danger" onClick={() => remove(story)}>Delete</button></div></div></article>)}</section></div></main></div>
}
