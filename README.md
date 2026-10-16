# Canvas due (Vercel)

Paste your Canvas calendar feed link once. The app reads it through a small serverless
function and refreshes every 5 minutes and whenever you reopen it. No AI involved.

Files: `index.html` (the app) and `api/feed.js` (the function that fetches your feed).

## Deploy
1. Put these files at the top level of a GitHub repo (index.html and the api folder).
2. On vercel.com: Add New, Project, import the repo, Framework Preset "Other", Deploy.
3. Recommended: Project Settings, Environment Variables, add `PASSCODE` (anything long),
   then redeploy. The app has a Passcode box; enter the same value once per device.

## Use
Open your Vercel address, paste your link, leave "Relay address" blank, Save and load.
