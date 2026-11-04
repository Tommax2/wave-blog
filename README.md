# WAVE Blog Backend

Dependency-free Node.js backend and admin panel for WAVE stories.

## Start

PowerShell:

```powershell
$env:ADMIN_PASSWORD='choose-a-strong-password-of-12-or-more-characters'
$env:MONGODB_URI='mongodb+srv://username:password@cluster.mongodb.net/wave_blog?retryWrites=true&w=majority'
$env:FRONTEND_ORIGIN='http://localhost:5173'
npm start
```

Open `http://localhost:4000/admin` to manage stories. The public API is available at `http://localhost:4000/api/stories`.

The server will refuse to start without an `ADMIN_PASSWORD` of at least 12 characters. Keep this password private.

Stories are stored in MongoDB. When the MongoDB collection is empty, the existing records in `data/stories.json` are imported once as starter content.

The frontend reads `VITE_API_URL`, defaulting to `http://localhost:4000` during local development.
