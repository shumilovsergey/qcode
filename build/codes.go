package main

// codes.go — CRUD for the user's saved QR codes.
// A code is a name plus the editor's full parameter set (stored as JSON).
//
// Every statement is scoped by user_id. The row id alone is never trusted, so a
// guessed id cannot reach another user's code; a statement that matches no row
// answers 404 rather than 403, so it never confirms that the id exists.

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// maxCodeBody caps a save request. Two of the editor's parameters (logo,
// bgImage) hold base64 data URIs of user uploads, so an unbounded body could
// push megabytes into a single row.
const maxCodeBody = 512 << 10 // 512 KB

type codeSummary struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updated_at"`
}

type codeFull struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	Params    json.RawMessage `json:"params"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type codeInput struct {
	Name   *string         `json:"name"`
	Params json.RawMessage `json:"params"`
}

// ── helpers ───────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// decodeCodeInput reads a size-capped JSON body and validates it.
func decodeCodeInput(w http.ResponseWriter, r *http.Request) (*codeInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxCodeBody)
	var in codeInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge,
				"code is too large — a logo or background image is over the 512 KB limit")
			return nil, false
		}
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return nil, false
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			writeErr(w, http.StatusBadRequest, "name cannot be empty")
			return nil, false
		}
		if len([]rune(name)) > 120 {
			writeErr(w, http.StatusBadRequest, "name is too long")
			return nil, false
		}
		in.Name = &name
	}
	// params must be a JSON object when present — the editor sends the whole
	// state object, and anything else would not survive a round trip.
	if len(in.Params) > 0 && !json.Valid(in.Params) {
		writeErr(w, http.StatusBadRequest, "params is not valid JSON")
		return nil, false
	}
	return &in, true
}

func codeID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

// ── handlers ──────────────────────────────────────────────────────────────

// handleListCodes returns the user's collection without params — browsing must
// stay cheap no matter how large an individual code's embedded images are.
func handleListCodes(w http.ResponseWriter, r *http.Request) {
	uid := sessionUserID(r)
	rows, err := db.Query(
		`SELECT id, name, updated_at FROM codes WHERE user_id = ? ORDER BY updated_at DESC`, uid)
	if err != nil {
		log.Printf("codes_list uid=%d error=%v", uid, err)
		writeErr(w, http.StatusInternalServerError, "could not load codes")
		return
	}
	defer rows.Close()

	out := []codeSummary{}
	for rows.Next() {
		var c codeSummary
		if err := rows.Scan(&c.ID, &c.Name, &c.UpdatedAt); err != nil {
			log.Printf("codes_list uid=%d error=%v", uid, err)
			writeErr(w, http.StatusInternalServerError, "could not load codes")
			return
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		log.Printf("codes_list uid=%d error=%v", uid, err)
		writeErr(w, http.StatusInternalServerError, "could not load codes")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func handleGetCode(w http.ResponseWriter, r *http.Request) {
	uid := sessionUserID(r)
	id, ok := codeID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	var c codeFull
	var params string
	err := db.QueryRow(
		`SELECT id, name, params, updated_at FROM codes WHERE id = ? AND user_id = ?`, id, uid,
	).Scan(&c.ID, &c.Name, &params, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		log.Printf("code_get uid=%d code_id=%d error=%v", uid, id, err)
		writeErr(w, http.StatusInternalServerError, "could not load code")
		return
	}
	c.Params = json.RawMessage(params)
	writeJSON(w, http.StatusOK, c)
}

func handleCreateCode(w http.ResponseWriter, r *http.Request) {
	uid := sessionUserID(r)
	in, ok := decodeCodeInput(w, r)
	if !ok {
		return
	}
	if in.Name == nil || len(in.Params) == 0 {
		writeErr(w, http.StatusBadRequest, "name and params are required")
		return
	}
	res, err := db.Exec(
		`INSERT INTO codes (user_id, name, params) VALUES (?, ?, ?)`, uid, *in.Name, string(in.Params))
	if err != nil {
		log.Printf("code_create uid=%d error=%v", uid, err)
		writeErr(w, http.StatusInternalServerError, "could not save code")
		return
	}
	id, _ := res.LastInsertId()
	log.Printf("code_create uid=%d code_id=%d result=ok", uid, id)
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

// handleUpdateCode saves an edit or a rename. Both fields are optional so the
// card list can rename without shipping the whole parameter set back.
func handleUpdateCode(w http.ResponseWriter, r *http.Request) {
	uid := sessionUserID(r)
	id, ok := codeID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	in, ok := decodeCodeInput(w, r)
	if !ok {
		return
	}
	if in.Name == nil && len(in.Params) == 0 {
		writeErr(w, http.StatusBadRequest, "nothing to update")
		return
	}

	sets := []string{"updated_at = CURRENT_TIMESTAMP"}
	args := []any{}
	if in.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *in.Name)
	}
	if len(in.Params) > 0 {
		sets = append(sets, "params = ?")
		args = append(args, string(in.Params))
	}
	args = append(args, id, uid)

	res, err := db.Exec(
		`UPDATE codes SET `+strings.Join(sets, ", ")+` WHERE id = ? AND user_id = ?`, args...)
	if err != nil {
		log.Printf("code_save uid=%d code_id=%d error=%v", uid, id, err)
		writeErr(w, http.StatusInternalServerError, "could not save code")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	log.Printf("code_save uid=%d code_id=%d result=ok", uid, id)
	w.WriteHeader(http.StatusNoContent)
}

func handleDeleteCode(w http.ResponseWriter, r *http.Request) {
	uid := sessionUserID(r)
	id, ok := codeID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	res, err := db.Exec(`DELETE FROM codes WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		log.Printf("code_delete uid=%d code_id=%d error=%v", uid, id, err)
		writeErr(w, http.StatusInternalServerError, "could not delete code")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	log.Printf("code_delete uid=%d code_id=%d result=ok", uid, id)
	w.WriteHeader(http.StatusNoContent)
}
