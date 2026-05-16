// callmap — Tauri shell. Hosts a single window pointed at the Vite dev
// server in development and the bundled `dist/` in release.
//
// v0.5 adds three IPC commands for OS-keychain backed PAT storage:
//   • get_token — read the PAT, or None if not set
//   • set_token — overwrite the PAT (empty string deletes the entry)
//   • clear_token — explicit delete
//
// Storage backend: the `keyring` crate. On Windows it uses the Windows
// Credential Manager; on macOS the Keychain Services API; on Linux the
// freedesktop secret-service over D-Bus (gnome-keyring / kwallet).
// Each platform stores the value encrypted at rest behind the user's
// session credentials — no plaintext on disk.

use keyring::Entry;

const SERVICE: &str = "callmap";
const USER: &str = "github-pat";

#[tauri::command]
fn get_token() -> Result<Option<String>, String> {
    match Entry::new(SERVICE, USER) {
        Ok(entry) => match entry.get_password() {
            Ok(t) => Ok(Some(t)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    let trimmed = token.trim();
    if trimmed.is_empty() {
        // Treat empty input as "clear the entry" — matches the v0.4
        // localStorage behavior where saving an empty value erased the
        // stored PAT. Don't propagate NoEntry as an error: the user-facing
        // outcome is the same.
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(trimmed).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn clear_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_token, set_token, clear_token])
        .run(tauri::generate_context!())
        .expect("error while running callmap");
}
