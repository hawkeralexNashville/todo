# To-Do

A single-user personal to-do list with an extremely quiet, Apple-style home
screen that shows only the one thing you should do next. The whole site sits
behind a single shared password.

- **One-off** tasks disappear for good when done (kept in history).
- **Evergreen** tasks come back every day (they reset at 4:00 AM local time).
- **Home** shows only the top item in your priority queue.
- **Organize** is the hub: a **Priority** list (the queue Home follows, drag to
  order) plus a **backlog** grouped into buckets. New items start in the backlog;
  drag one up into Priority to queue it, or back down to defer it.
- **Done** is the history, where you can permanently delete items.

Built with Next.js (App Router) + Supabase (Postgres) + Tailwind. The password
gate runs server-side in Next.js middleware — it is a real gate, not something
you can bypass in the browser.

---

## Deploying it (all clicks, no terminal)

You need two free accounts: **Supabase** (the database) and **Vercel** (the
host). Then you point your domain at Vercel.

### 1. Create the database (Supabase)

1. Go to <https://supabase.com>, sign in, and click **New project**.
2. Pick a name and a strong database password (you won't need it again here),
   choose a region near you, and create the project. Wait ~1 minute for it to
   finish provisioning.
3. In the left sidebar open **SQL Editor** → **New query**. Open the
   `schema.sql` file from this repo, copy its entire contents into the editor,
   and click **Run**. You should see "Success".
4. In the left sidebar open **Project Settings** (gear) → **API**. Keep this tab
   open — you'll copy two values from it in step 3:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **service_role** secret key (under "Project API keys" — click reveal).
     ⚠️ This is a secret. It only ever goes into Vercel, never into the code.

### 2. Deploy the app (Vercel)

1. Go to <https://vercel.com>, sign in with GitHub.
2. Click **Add New… → Project**, find the `todo` repository, and click
   **Import**.
3. Leave the framework as **Next.js** and the build settings at their defaults.
4. Before clicking Deploy, expand **Environment Variables** and add these four
   (see the next section for what each one is):

   | Name | Value |
   |------|-------|
   | `SITE_PASSWORD` | the password you want to type to get in |
   | `SUPABASE_URL` | the Project URL from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role secret from Supabase |
   | `APP_TIMEZONE` | your timezone, e.g. `America/Chicago` |

5. Click **Deploy**. After a minute you'll get a `*.vercel.app` URL. Open it,
   type your `SITE_PASSWORD`, and you're in.

### 3. Point your domain at it

1. In your Vercel project: **Settings → Domains → Add**, and enter your domain.
2. Vercel shows you the DNS records to add. Add them at your domain registrar
   (the company you bought the domain from). This usually takes a few minutes to
   an hour to go live.

That's it. To change the password later, edit `SITE_PASSWORD` in Vercel
(**Settings → Environment Variables**) and redeploy.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SITE_PASSWORD` | yes | The single shared password for the whole site. |
| `SUPABASE_URL` | yes | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role (secret) key. Server-side only. |
| `APP_TIMEZONE` | no | IANA timezone for the 4 AM evergreen reset. Defaults to `America/Chicago`. |

A copy-paste template lives in `.env.local.example`.

---

## Running it locally (optional — you don't need to)

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Then open <http://localhost:3000>.

---

## How the pieces fit

- `middleware.js` — the password gate. Blocks every route except the login
  page/API until a valid signed cookie is present.
- `app/api/login/route.js` — checks the password and sets the signed cookie.
- `app/api/items/*` — create (into backlog), list (active), mark done, skip,
  rename/retype/rebucket, hard delete.
- `app/api/priority/route.js` — sets the whole priority queue (promote, demote,
  and reorder in one call).
- `app/api/buckets/*` — create, rename, delete buckets.
- `lib/reset.js` — the 4 AM daily reset for evergreen items, run on load.
- `app/page.js` — Home (one item). `app/organize` — Priority queue + backlog
  buckets. `app/add`, `app/done` — the other screens.
- `schema.sql` — the database tables. `migration-*.sql` — incremental changes
  for a database created before a feature existed.
