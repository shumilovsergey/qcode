package main

// app_db.go — app-specific database migrations.
// initDB() calls appMigrate() after the core users table is ready.

func appMigrate() error {
	// A saved QR code is a name plus the full parameter set from the editor.
	// params holds those parameters as JSON rather than one column per knob:
	// the control rack grows over time, and a column per param would mean a
	// schema migration every time a knob is added. version lets a future
	// param rename be migrated on read instead of a destructive ALTER.
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS codes (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id    INTEGER NOT NULL REFERENCES users(id),
		name       TEXT    NOT NULL,
		params     TEXT    NOT NULL,
		version    INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_codes_user ON codes(user_id, updated_at DESC)`)
	return err
}
