package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

var buildTime = "unknown"

//go:embed web
var webFiles embed.FS

var (
	appName      string
	authURL      string
	authInternal string
	appURL       string
	appToken     string
	tmpl         *template.Template
	httpClient   = &http.Client{}
)

// defaultAppName is the fallback when APP_NAME is unset, so a service file that
// forgets the variable still starts and still gets qcode.db rather than a
// database named after the empty string.
const defaultAppName = "qcode"

type pageData struct {
	User  *User
	Error string
}

func initTemplate() {
	src, err := webFiles.ReadFile("web/index.html")
	if err != nil {
		log.Fatalf("web/index.html not found: %v", err)
	}
	tmpl = template.Must(template.New("index").Parse(string(src)))
}

// ── request logging ───────────────────────────────────────────────────────────

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(status int) {
	sw.status = status
	sw.ResponseWriter.WriteHeader(status)
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

// ── static asset caching ──────────────────────────────────────────────────
// Files embedded with //go:embed carry a zero ModTime, so http.ServeContent
// emits neither Last-Modified nor ETag. With no validator the browser cannot
// tell a rebuilt asset from the copy it already has, and happily serves stale
// CSS/JS after a rebuild. So we hash every embedded file once at startup and
// revalidate on each request: "no-cache" means "ask me first", not "don't
// store", so an unchanged asset costs a 304 instead of a refetch.

var etags = map[string]string{}

func initETags() {
	fs.WalkDir(webFiles, "web", func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
		if err != nil || d.IsDir() {
			return nil //nolint:nilerr
		}
		b, err := webFiles.ReadFile(p)
		if err != nil {
			return nil //nolint:nilerr
		}
		sum := sha256.Sum256(b)
		etags[strings.TrimPrefix(p, "web")] = `"` + hex.EncodeToString(sum[:8]) + `"`
		return nil
	})
}

func staticCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tag, ok := etags[r.URL.Path]; ok {
			w.Header().Set("ETag", tag)
			w.Header().Set("Cache-Control", "no-cache")
			if r.Header.Get("If-None-Match") == tag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

// requireAuthJSON guards the /api routes. requireAuth redirects to /login,
// which hands a fetch() an HTML page instead of an error — an XHR caller needs
// a status it can branch on.
func requireAuthJSON(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if sessionUserID(r) == 0 {
			writeErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		next(w, r)
	}
}

// ── app routes ────────────────────────────────────────────────────────────────
// Add your app-specific handlers here.

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if code := r.URL.Query().Get("code"); code != "" {
		handleCallback(w, r, code)
		return
	}
	var user *User
	if uid := sessionUserID(r); uid != 0 {
		user, _ = getUserByID(uid)
	}
	tmpl.Execute(w, pageData{User: user}) //nolint:errcheck
}

// ── main ──────────────────────────────────────────────────────────────────────

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

	authURL = os.Getenv("AUTH_URL")
	authInternal = os.Getenv("AUTH_INTERNAL")
	appURL = os.Getenv("APP_URL")
	appToken = os.Getenv("APP_TOKEN")

	secretKey := os.Getenv("SECRET_KEY")
	if secretKey == "" {
		secretKey = "dev-secret"
	}
	jwtSecret = []byte(secretKey)

	initDB()
	initTemplate()
	initETags()

	webFS, _ := fs.Sub(webFiles, "web")
	fileServer := http.FileServer(http.FS(webFS))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", handleIndex)
	mux.HandleFunc("GET /login", handleLogin)
	mux.HandleFunc("GET /logout", handleLogout)
	mux.HandleFunc("GET /apps", handleOpenApps)

	// saved QR codes — see codes.go
	mux.HandleFunc("GET /api/codes", requireAuthJSON(handleListCodes))
	mux.HandleFunc("POST /api/codes", requireAuthJSON(handleCreateCode))
	mux.HandleFunc("GET /api/codes/{id}", requireAuthJSON(handleGetCode))
	mux.HandleFunc("PUT /api/codes/{id}", requireAuthJSON(handleUpdateCode))
	mux.HandleFunc("DELETE /api/codes/{id}", requireAuthJSON(handleDeleteCode))

	mux.Handle("GET /favicon.svg", staticCache(fileServer))
	mux.Handle("GET /style.css", staticCache(fileServer))
	mux.Handle("GET /script.js", staticCache(fileServer))
	mux.Handle("GET /qr/", staticCache(fileServer)) // QR engine modules — web/qr/*.js

	port := os.Getenv("PORT")
	if port == "" {
		port = "8890"
	}
	log.Printf("start app=%s db=%s port=%s", appName, os.Getenv("DB_PATH"), port)
	log.Fatal(http.ListenAndServe(":"+port, logMiddleware(mux)))
}
