# Supabase setup (one-off, ~10 minutes)

## 1. Create the project
1. Sign up at <https://supabase.com> (GitHub sign-in is fine).
2. **New project**
   - Name: `dahlias`
   - Database password: click *Generate* and save it in your password manager
     (the app never needs it)
   - Region: **Asia-Pacific (Sydney)** (closest to NZ)
   - Plan: Free
3. Wait for the project to finish provisioning (~2 min).

## 2. Create the database
1. Left sidebar > **SQL Editor** > **New query**.
2. Paste the entire contents of [`schema.sql`](schema.sql) and click **Run**.
3. Expect "Success. No rows returned". Check under **Table Editor** that tables like
   `plants`, `crosses` and `seed_lots` exist and that `lists` has rows.

Run it once only. Running it a second time errors because the tables already exist.

## 3. Create your login and lock the door
1. **Authentication > Users > Add user > Create new user**
   - Email: your email
   - Password: leave blank or set anything (the app logs in by emailed code)
   - Tick **Auto Confirm User**
2. **Authentication > Sign In / Providers**
   - Turn **off** "Allow new users to sign up" and save.
     *This is what keeps everyone else out. Don't skip it.*
   - Under **Email**, make sure the Email provider is enabled.
3. **Authentication > Emails > Templates > Magic Link**. Replace the body with
   the following so the email contains a code instead of a link:
   ```html
   <h2>Your Dahlias login code</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   ```
   Subject: `Dahlias login code`. Save.
4. **Authentication > URL Configuration**: set Site URL to
   `https://dyjoso.github.io/dahlias/`.

The built-in email sender is limited to a few emails per hour. That's plenty for one
user, since you only log in again occasionally.

## 4. Send Claude the connection details
**Project Settings > API Keys** (or **Data API**). Copy:
- **Project URL**, e.g. `https://abcdxyz.supabase.co`
- **Publishable key** (`sb_publishable_...`). On older projects this is the **anon public** key.

Both are safe to put in the app; the database rules do the protecting.

**Never** share the `secret` / `service_role` key, or the database password.
