# CSC-SoC College Days: Kabanata XXI Bingo

Attendance + BINGO incentive tracker for College Days. Students scan a QR code, check in with their name and
block/section (irregular students input all their blocks), find people who match the prompts and take selfies. A BINGO is a blackout (every box filled). Students show it to their SoC professors to qualify for possible incentives.
Officers see a live board, mark incentives as claimed, and export attendance as CSV.

Stack: static page + Vercel serverless functions (`/api`) + **Supabase (Postgres)**. No npm dependencies.
Use a NEW GitHub repo, a NEW Vercel project and a NEW Supabase project, separate from the HR committee version.

## 1. Supabase (database)
1. https://supabase.com -> New project (pick the region closest to your school, set a database password).
2. Open **SQL Editor** -> New query -> paste all of `supabase/schema.sql` -> **Run**. (Safe to run again.)
3. **Project Settings -> API Keys**: copy the **Secret key** (`sb_secret_...`) and from **Data API** copy the **Project URL**.
   The secret key goes only into Vercel, never into the code or the browser.

## 2. GitHub
Create a new repository and upload everything in this folder (keep the `api`, `public` and `supabase` folders).

## 3. Vercel
1. Add New -> Project -> import the repo. Framework Preset: **Other**. No build command, no output directory.
2. Settings -> Environment Variables (all environments):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SECRET_KEY` = your secret key
   - `ADMIN_PASSWORD` = the host password officers will type
3. Deploy (or Redeploy after adding variables).
4. Open `https://YOUR-SITE.vercel.app/api/health`. It must say `"ok": true`. If not, it tells you what is missing.

## 4. QR code
Make a QR code of your site URL (any QR generator) and print it.

## Running the event
1. Before students arrive: open the site, tap **Host login**, check the prompts, save.
2. Students scan and check in. Check-in counts as attendance even before the game starts.
3. Host taps **Turn game ON**. There is no countdown: the game stays ON until the host taps **Turn game OFF**. Use **Now showing** to set the ongoing event (students see it at the top of their screen); change it as events change.
4. Live board (host only): see progress, mark **Incentive claimed** when you hand it out.
5. When time is up: winners showcase, download cards, **Download attendance (CSV)**.
6. **Reset** wipes all students and saved cards for the next session. Download your files first.

## Capacity (Supabase)
- Built for a crowd: phones read a 3-second edge-cached state, so 1,000+ students do not hammer the database.
  The app accepts up to 1,500 check-ins (`MAX_PLAYERS` in `api/progress.js`).
- Free plan: 500 MB database, 5 GB bandwidth/month. Each selfie takes about 100-190 KB, so roughly 2,500-4,000 selfies fit.
  For more students, upgrade to Pro ($25/month) before the event.
- Free projects **pause after 7 days without activity**. Open the site / `/api/health` the day before and make sure
  the project is not paused (Supabase dashboard -> Restore).
- Security: Row Level Security is on with no public policies; only the server (secret key) can touch the data.
- Tip: after the event, download everything, then **Reset** to free storage.

## Files
- `public/index.html` the whole student + host app
- `api/*.js` serverless endpoints; `api/_db.js` the Supabase client
- `supabase/schema.sql` tables (`game_state`, `players`)
- The CSC-SoC logo is in `public/logo-512.png` (header, loader, favicons). The 24 prompts live in `DEF` inside `public/index.html`; the host can also edit them in the dashboard.

## Storage
Each student has ONE saved picture: their bingo card with the selfies already on it (about 100-150 KB), saved at 6, 12, 18 and 24 boxes and when the game turns OFF. About 3,000 students fit in Supabase's free 500 MB. Selfies are taken with the live camera only (front or rear); there is no gallery upload.

## Upgrading an existing database
Re-run `supabase/schema.sql` in the Supabase SQL Editor before deploying (it adds the card and event columns and drops the old `photos` table).
