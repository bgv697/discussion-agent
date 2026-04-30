# Graduate Discussion Agent — LTI Setup Guide

An AI-facilitated weekly discussion tool that lives natively inside Canvas as an LTI 1.1 external tool. Students open it from an assignment, have a Socratic dialogue, and submit their transcript — all without leaving Canvas.

---

## Project structure

```
discussion-agent-lti/
├── server.js           ← Express server (LTI launch + API proxy)
├── canvas_config.xml   ← Paste into Canvas to register the tool
├── .env.example        ← Copy to .env and fill in values
├── package.json
└── public/
    └── index.html      ← The student-facing chat UI
```

---

## Step 1 — Deploy the server

You need the app hosted at a public HTTPS URL before Canvas can reach it.

### Option A — Render (recommended, free tier)
1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service → connect your repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set environment variables (see Step 2) in the Render dashboard
6. Note your URL: `https://your-app-name.onrender.com`

### Option B — Railway
1. Push to GitHub → [railway.app](https://railway.app) → New Project → Deploy from repo
2. Set env vars in the Railway dashboard
3. Note your URL

### Option C — Vercel
Vercel needs a small adjustment for Express — add a `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

---

## Step 2 — Set environment variables

In your hosting dashboard, set these variables (or copy `.env.example` to `.env` for local dev):

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |
| `LTI_KEY` | Any string, e.g. `discussion_agent` |
| `LTI_SECRET` | A long random secret, e.g. `xK9mP2...` |
| `DEFAULT_QUESTION` | Fallback question if not set per-assignment |
| `PORT` | Usually set automatically by host |

**Generate a good secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 3 — Register the tool in Canvas

### In Canvas (Admin or Teacher with appropriate permissions):

1. Go to your **course** → **Settings** → **Apps** tab → **View App Configurations** → **+ App**
2. Configuration Type: **Paste XML**
3. Name: `Graduate Discussion Agent`
4. Consumer Key: *exactly matches* your `LTI_KEY`
5. Shared Secret: *exactly matches* your `LTI_SECRET`
6. In the XML field, paste the contents of `canvas_config.xml`
   — replace `YOUR_APP_URL` with your deployed URL (e.g. `https://your-app.onrender.com`)
7. Click **Submit**

**Or via URL** (simpler): host `canvas_config.xml` at `https://your-app.com/lti/config.xml`
and choose Configuration Type: **By URL**.

---

## Step 4 — Create an assignment using the tool

1. In Canvas, create a new **Assignment**
2. Submission Type: **External Tool**
3. Click **Find** → select **Graduate Discussion Agent**
4. To set the question for this specific assignment, add **Custom Parameters**:
   ```
   discussion_question=How does this week's reading challenge your prior understanding of X?
   week_label=Week 5 Discussion
   facilitator_role=socratic
   ```
5. Save the assignment

Students click the assignment → Canvas POSTs the LTI launch → they see the question and chat UI → they submit and it appears in SpeedGrader as a text submission.

---

## Step 5 — Verify it works

Test the LTI launch manually:
```
https://your-app.com/?launch=<base64-encoded-test-data>
```

Or use the **LTI Test Tool** at [lti.tools](https://lti.tools) to simulate a Canvas launch.

---

## How the data flows

```
Student opens assignment in Canvas
        ↓
Canvas POSTs LTI launch to /lti/launch
        ↓
Server validates key/secret, extracts context
(course ID, assignment ID, student ID, question)
        ↓
Server redirects to /?launch=<base64-encoded-context>
        ↓
Student chats → browser calls /api/chat
        ↓
Server calls Anthropic API (key stays server-side)
        ↓
Student submits → browser calls /api/submit
        ↓
Server calls Canvas API → submission appears in SpeedGrader
```

---

## Customizing per assignment

In Canvas assignment Custom Parameters, you can set:

| Parameter | Effect |
|---|---|
| `discussion_question` | The question shown to students |
| `week_label` | Badge text in the header |
| `facilitator_role` | `socratic` / `coach` / `devil_advocate` / `neutral` |

---

## Security notes

- The Anthropic API key never touches the browser — all AI calls go through `/api/chat`
- LTI launch is validated using HMAC-SHA1 signature (via `ims-lti` library)
- Canvas tokens for submission are passed through the server, not stored
- For production, add rate limiting (e.g. `express-rate-limit`) to `/api/chat`
- Consider logging submissions to a database for backup

---

## Upgrading to LTI 1.3 (optional)

LTI 1.3 uses OAuth2/OIDC instead of shared secrets — more secure but more complex to set up. Canvas supports both. LTI 1.1 (used here) is still widely used and fully functional. If your institution requires 1.3, the `ltijs` npm package is the recommended library.
