# `APP_NAME` — the app's identity, and the database as its child

A portable note for every app on the **sh-development** platform. It describes
one rule:

> **`APP_NAME` is the app's identity. The database file is named after it.
> The name is the parent; the DB filename is a child that falls out of it.**

Everything downstream reads the resolved name, never a string literal. Change
`APP_NAME` in the environment and the app renames itself — including its
database — without touching a line of Go.

---

## 1. The flow, end to end

```
.env / env_file / systemd Environment=
            │
            │  APP_NAME=qcode
            ▼
  godotenv.Load()                 ← .env, only for keys not already in the env
            │
            ▼
  appName = os.Getenv("APP_NAME")
  if appName == "" { appName = defaultAppName }        ← const in main.go
            │
            ├──────────────► --version / --info banner    "qcode built: <time>"
            ├──────────────► start log line               "start app=qcode …"
            │
            ▼
  if os.Getenv("DB_PATH") == "" {
      os.Setenv("DB_PATH", appName + ".db")             ← the child
  }
            │
            ▼
  initDB() in db.go: path := os.Getenv("DB_PATH")
            │
            ▼
  sql.Open("sqlite", path)                              → ./qcode.db
```

Four steps, in this exact order, all inside `main()` before anything else runs.

### The code (`build/main.go`)

```go
// defaultAppName is the fallback when APP_NAME is unset, so a service file that
// forgets the variable still starts and still gets qcode.db rather than a
// database named after the empty string.
const defaultAppName = "qcode"

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.LUTC)
	godotenv.Load() //nolint:errcheck

	// Resolved before anything else: --version prints it, and the database is
	// named after it. Everything downstream reads appName, never a literal.
	appName = os.Getenv("APP_NAME")
	if appName == "" {
		appName = defaultAppName
	}

	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "--info") {
		fmt.Printf("%s built: %s\n", appName, buildTime)
		os.Exit(0)
	}

	// An explicit DB_PATH always wins — that is how the compose mount puts the
	// file in /data. With nothing set the name follows the app instead of a
	// literal, so a service file copied to the next app cannot leave it quietly
	// writing into qcode.db. db.go reads DB_PATH, so setting it here keeps that
	// template file untouched and makes its own fallback unreachable.
	if os.Getenv("DB_PATH") == "" {
		os.Setenv("DB_PATH", appName+".db") //nolint:errcheck
	}

	// … the rest of the config, then:
	initDB()
	// …
	log.Printf("start app=%s db=%s port=%s", appName, os.Getenv("DB_PATH"), port)
}
```

### The consumer (`build/db.go` — a **DO-NOT-EDIT** template file)

```go
func initDB() {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = "qcode.db"          // unreachable — main() already filled DB_PATH
	}
	db, err = sql.Open("sqlite", path)
	// …
}
```

---

## 2. Why it is wired this way

**Why `os.Setenv` instead of passing a filename into `initDB()`?**
`db.go` is a shared template file — the same bytes live in every app in the
ecosystem (`auth-human.go`, `auth-server.go`, `db.go`). Changing its signature
would fork it per app. Writing `DB_PATH` back into the environment lets `main.go`
— the file you *are* allowed to edit — decide the value, while `db.go` keeps its
one-line `os.Getenv` and stays byte-identical everywhere.

**Why does `db.go` still have its own `"qcode.db"` fallback?**
Dead code, deliberately. `main()` guarantees `DB_PATH` is non-empty before
`initDB()` is called, so the branch never fires. It stays because the file is a
template and must be safe on its own.

**Why does an explicit `DB_PATH` win?**
Because deployment topology is not the app's business. Docker needs the file at
`/data/qcode.db` so it lands on the mounted volume; prod may need
`/var/lib/qcode/qcode.db`. The derived name is a *default*, not a policy.

**Why a `defaultAppName` const at all?**
So a service file that forgets `APP_NAME=` still boots. Without it the app would
open a database literally called `.db`.

---

## 3. What actually derives from `APP_NAME` — and what does not

Be honest about the blast radius. At **runtime**, exactly three things follow the
variable:

| Follows `APP_NAME` | Where |
|---|---|
| The database filename (when `DB_PATH` is unset) | `main.go` → `db.go` |
| The `--version` / `--info` banner | `main.go` |
| The `start app=… db=… port=…` log line | `main.go` |

Everything else carrying the app's name is a **build-time or static literal** and
must be edited by hand when you fork the template:

| Hardcoded | Where |
|---|---|
| `const defaultAppName` | `build/main.go` |
| Binary name (`-o /qcode`) | `Dockerfile`, builder stage |
| Binary copy + build banner | `prod-compose.yml` |
| Air's build output path | `build/.air.toml` |
| `<title>`, `og:title`, tab label, login logo | `build/web/index.html` |
| Compose service name | `dev-compose.yml` |
| Readme URL in the user popover | `build/web/index.html` |
| Fallback string in `db.go` | `build/db.go` (unreachable, but rename it anyway) |

**`APP_NAME` is not a rename button for a fork.** It is the runtime identity —
the thing that decides which database this process opens and what it calls
itself in logs. Treat the table above as the fork checklist.

---

## 4. Gotchas that actually bite

### Empty and unset are the same thing
`os.Getenv` returns `""` for both. So all three of these mean *"derive the DB
name from `APP_NAME`"*:

```ini
# not present at all
DB_PATH=              # .env / env_file
Environment=DB_PATH=  # systemd unit
```

That is intentional and useful — a unit file can keep the line present as
documentation while leaving the value blank.

### `.env` never overrides a real environment variable
`godotenv.Load()` skips keys that are already set in the process environment.
Precedence, highest first:

```
real env (systemd Environment= / compose env_file / docker -e)  ›  .env  ›  const default
```

Also: `godotenv.Load()` reads `.env` **from the process working directory**. In
`dev-compose.yml` only `./build` is mounted at `/app`, so the repo-root `.env` is
not visible inside the container — `env_file: .env` is what delivers it there.

### A relative `DB_PATH` resolves against the working directory
`qcode.db` is a relative path. Under systemd, if `WorkingDirectory=` is empty the
process starts in `/` and the database is created at `/qcode.db` — not next to
the binary. **Always set `WorkingDirectory=` in the unit file**, or set an
absolute `DB_PATH`. A stray database in an unexpected directory is almost always
this.

### Renaming does not migrate
Changing `APP_NAME` on a running deployment makes the app open a *different*
file. SQLite creates it empty and the app comes up with zero users and zero
data — looking wiped, though nothing was lost. To actually rename:

```bash
systemctl stop myapp
mv /srv/myapp/oldname.db /srv/myapp/newname.db
# and the sidecar files, if the app was not shut down cleanly:
mv /srv/myapp/oldname.db-wal /srv/myapp/newname.db-wal 2>/dev/null
mv /srv/myapp/oldname.db-shm /srv/myapp/newname.db-shm 2>/dev/null
# then edit APP_NAME= in the unit, and:
systemctl daemon-reload && systemctl start myapp
```

### An explicit `DB_PATH` silences `APP_NAME` entirely
In `dev-compose.yml` the env file sets `DB_PATH=/data/qcode.db`, so changing
`APP_NAME` there renames the logs but **not** the database. That is correct — the
path is pinned to the volume mount — but do not be surprised by it. If you want
the derived name inside Docker, drop `DB_PATH` and mount the volume at the
working directory instead.

### Confirm it at boot
The start line exists precisely so you never have to guess:

```
start app=qcode db=/data/qcode.db port=8890
```

If that says something you did not expect, fix the environment — not the code.

---

## 5. Adopting this in another app

1. **Add the config block to `main()`**, in this order: `godotenv.Load()` →
   resolve `appName` → `--version` check → derive `DB_PATH` → everything else →
   `initDB()`. The derivation must happen *before* `initDB()`.

   ```go
   var appName string
   const defaultAppName = "myapp"   // ← your app

   appName = os.Getenv("APP_NAME")
   if appName == "" {
       appName = defaultAppName
   }
   if os.Getenv("DB_PATH") == "" {
       os.Setenv("DB_PATH", appName+".db") //nolint:errcheck
   }
   ```

2. **Leave `db.go` alone** apart from its fallback literal. It reads `DB_PATH`
   and that is all it should ever do.

3. **Log it**: `log.Printf("start app=%s db=%s port=%s", appName, os.Getenv("DB_PATH"), port)`.

4. **Document it in `.env.example`**, both lines:

   ```ini
   # Name of this app. The database is named after it when DB_PATH is unset, so
   # APP_NAME=foo gives foo.db. Defaults to myapp.
   APP_NAME=myapp

   # SQLite path — an explicit value always wins.
   # Leave unset to get <APP_NAME>.db in the working directory instead.
   DB_PATH=/data/myapp.db
   ```

5. **Fix the unit file**: set `APP_NAME=`, set `WorkingDirectory=`, and either
   set an absolute `DB_PATH=` or leave it blank on purpose.

6. **Walk the hardcoded table in §3** and rename every literal.

7. **Verify before deploying**: `./myapp --version` prints the name, and the
   first log line reports the exact database path the process opened.

---

## 6. Fixing an app that already has the wrong database name

The variable does not rename anything on disk. Do it in this order:

```bash
# 1. what is it opening right now?
journalctl -u myapp -n 50 | grep '^.*start app='
# or, if it is already stopped:
./myapp --version

# 2. find the real file
ls -la /path/to/workdir/*.db*

# 3. stop, move, repoint
systemctl stop myapp
mv wrongname.db myapp.db
#    …and any -wal / -shm sidecars alongside it

# 4. set APP_NAME (and WorkingDirectory) in the unit, then
systemctl daemon-reload && systemctl start myapp

# 5. confirm the start line names the file you just moved
journalctl -u myapp -n 20
```

If two databases exist (`myapp.db` **and** `myapp-1.db`, or a stray `/qcode.db`
at the filesystem root), the app was started at some point with a different
working directory or a different `APP_NAME`. Check both files' `users` tables
before deciding which one is live — the newer `mtime` is usually, but not
always, the right answer:

```bash
sqlite3 myapp.db   'SELECT count(*), max(last_login) FROM users;'
sqlite3 myapp-1.db 'SELECT count(*), max(last_login) FROM users;'
```

Keep the one with real logins, archive the other, and only then set
`WorkingDirectory=` so it cannot happen again.
