use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use once_cell::sync::Lazy;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::web_store;

pub const WORKSPACES_DIR: &str = "workspaces";
pub const ACTIVE_FILE: &str = "active.json";
pub const DEFAULT_WORKSPACE: &str = "default";
pub const DB_FILE: &str = "things.db";
pub const RAW_CONTENT_DIR: &str = "raw_content";
pub const EMBEDDINGS_DIR: &str = "embeddings";
pub const MEDIA_DIR: &str = "media";

const MAX_NAME_LEN: usize = 64;
const ACTIVE_CHANGED_EVENT: &str = "db-switched";

/// Cached active workspace name so every DB call does not re-read `active.json`.
static ACTIVE_CACHE: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveDatabaseFile {
    active: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub size_bytes: u64,
    pub is_active: bool,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub fn workspaces_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join(WORKSPACES_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Database name cannot be empty".to_string());
    }
    if trimmed.len() > MAX_NAME_LEN {
        return Err(format!(
            "Database name cannot be longer than {MAX_NAME_LEN} characters"
        ));
    }
    let valid = trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_');
    if !valid {
        return Err(
            "Database name can only contain letters, numbers, dashes and underscores".to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn read_active_file(app: &AppHandle) -> Result<String, String> {
    let path = data_dir(app)?.join(ACTIVE_FILE);
    if !path.exists() {
        return Ok(DEFAULT_WORKSPACE.to_string());
    }
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed: ActiveDatabaseFile = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let name = parsed.active.trim();
    if name.is_empty() {
        Ok(DEFAULT_WORKSPACE.to_string())
    } else {
        Ok(name.to_string())
    }
}

fn write_active_file(app: &AppHandle, name: &str) -> Result<(), String> {
    let path = data_dir(app)?.join(ACTIVE_FILE);
    let payload = ActiveDatabaseFile {
        active: name.to_string(),
    };
    let raw = serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&path, raw).map_err(|error| error.to_string())?;
    set_active_cache(Some(name.to_string()));
    Ok(())
}

fn set_active_cache(name: Option<String>) {
    let mut cache = ACTIVE_CACHE.write().unwrap_or_else(|poison| poison.into_inner());
    *cache = name;
}

pub fn active_name(app: &AppHandle) -> Result<String, String> {
    {
        let cache = ACTIVE_CACHE.read().unwrap_or_else(|poison| poison.into_inner());
        if let Some(name) = cache.as_ref() {
            return Ok(name.clone());
        }
    }
    let name = read_active_file(app)?;
    set_active_cache(Some(name.clone()));
    Ok(name)
}

pub fn workspace_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(workspaces_root(app)?.join(name))
}

pub fn active_workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    workspace_dir(app, &active_name(app)?)
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(active_workspace_dir(app)?.join(DB_FILE))
}

pub fn raw_content_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = active_workspace_dir(app)?.join(RAW_CONTENT_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub fn embeddings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = active_workspace_dir(app)?.join(EMBEDDINGS_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = active_workspace_dir(app)?.join(MEDIA_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn workspace_layout_dirs(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = workspace_dir(app, name)?;
    for subdir in [RAW_CONTENT_DIR, EMBEDDINGS_DIR, MEDIA_DIR] {
        fs::create_dir_all(dir.join(subdir)).map_err(|error| error.to_string())?;
    }
    Ok(dir)
}

fn ensure_active_workspace(app: &AppHandle) -> Result<(), String> {
    let name = active_name(app)?;
    workspace_layout_dirs(app, &name)?;
    Ok(())
}

fn move_path(from: &Path, to: &Path) -> Result<(), String> {
    if !from.exists() || to.exists() {
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            if from.is_dir() {
                copy_dir_all(from, to).map_err(|error| error.to_string())?;
                fs::remove_dir_all(from).map_err(|error| error.to_string())
            } else {
                fs::copy(from, to).map_err(|error| error.to_string())?;
                fs::remove_file(from).map_err(|error| error.to_string())
            }
        }
    }
}

fn copy_dir_all(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Moves the pre-workspaces layout (`things.db` and friends at the app data
/// root) into `workspaces/default` and pins `active.json` to it. Runs once;
/// later launches find `active.json` and only make sure the active workspace
/// folder exists.
pub fn migrate_legacy_layout(app: &AppHandle) -> Result<(), String> {
    let data = data_dir(app)?;
    let root = workspaces_root(app)?;
    let active_path = data.join(ACTIVE_FILE);

    if !active_path.exists() {
        let target = root.join(DEFAULT_WORKSPACE);
        fs::create_dir_all(&target).map_err(|error| error.to_string())?;

        for filename in [DB_FILE, "things.db-wal", "things.db-shm"] {
            move_path(&data.join(filename), &target.join(filename))?;
        }
        for dirname in [RAW_CONTENT_DIR, EMBEDDINGS_DIR, MEDIA_DIR] {
            move_path(&data.join(dirname), &target.join(dirname))?;
        }

        write_active_file(app, DEFAULT_WORKSPACE)?;
    }

    ensure_active_workspace(app)
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += metadata.len();
        }
    }
    total
}

fn checkpoint_database(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    let busy: i64 = conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if busy != 0 {
        return Err(
            "The database is busy right now. Wait for running tasks to finish and try again."
                .to_string(),
        );
    }
    Ok(())
}

fn find_database_root(staging: &Path) -> Result<PathBuf, String> {
    if staging.join(DB_FILE).is_file() {
        return Ok(staging.to_path_buf());
    }
    let mut candidates = Vec::new();
    if let Ok(entries) = fs::read_dir(staging) {
        for entry in entries.flatten() {
            if entry.path().join(DB_FILE).is_file() {
                candidates.push(entry.path());
            }
        }
    }
    match candidates.len() {
        1 => Ok(candidates.remove(0)),
        0 => Err(format!(
            "The archive does not contain a notian database (missing {DB_FILE})"
        )),
        _ => Err("The archive contains more than one database".to_string()),
    }
}

fn zip_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644)
}

fn add_tree_to_zip(
    zip: &mut ZipWriter<File>,
    root: &Path,
    current: &Path,
    skip: Option<&Path>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if skip == Some(path.as_path()) {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            zip.add_directory(format!("{relative}/"), zip_options())
                .map_err(|error| error.to_string())?;
            add_tree_to_zip(zip, root, &path, skip)?;
            continue;
        }

        // Post-checkpoint these should be empty; never ship SQLite temp files.
        if relative.ends_with("-wal") || relative.ends_with("-shm") {
            continue;
        }

        zip.start_file(relative.clone(), zip_options())
            .map_err(|error| error.to_string())?;
        let mut source = File::open(&path).map_err(|error| error.to_string())?;
        io::copy(&mut source, zip).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn export_workspace_to_zip(source: &Path, target: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err(format!("Database folder not found: {}", source.display()));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let file = File::create(target).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let skip = fs::canonicalize(target).ok();
    let source = fs::canonicalize(source).map_err(|error| error.to_string())?;
    add_tree_to_zip(&mut zip, &source, &source, skip.as_deref())?;
    let mut file = zip.finish().map_err(|error| error.to_string())?;
    file.flush().map_err(|error| error.to_string())?;
    Ok(())
}

fn extract_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            return Err("The archive contains an unsafe file path".to_string());
        };
        let output = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut file = File::create(&output).map_err(|error| error.to_string())?;
        io::copy(&mut entry, &mut file).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn db_list(app: AppHandle) -> Result<Vec<DatabaseInfo>, String> {
    let root = workspaces_root(&app)?;
    let active = active_name(&app)?;
    let mut databases = Vec::new();

    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        databases.push(DatabaseInfo {
            is_active: name == active,
            size_bytes: dir_size(&entry.path()),
            name,
        });
    }

    databases.sort_by(|left, right| {
        right
            .is_active
            .cmp(&left.is_active)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(databases)
}

#[tauri::command]
pub fn db_active_name(app: AppHandle) -> Result<String, String> {
    active_name(&app)
}

#[tauri::command]
pub fn db_media_dir(app: AppHandle) -> Result<String, String> {
    Ok(media_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn db_create(app: AppHandle, name: String) -> Result<(), String> {
    let name = validate_name(&name)?;
    let dir = workspace_dir(&app, &name)?;
    if dir.exists() {
        return Err(format!("Database \"{name}\" already exists"));
    }
    let dir = workspace_layout_dirs(&app, &name)?;
    web_store::init_database_at(&dir.join(DB_FILE))
}

#[tauri::command]
pub fn db_switch(app: AppHandle, name: String) -> Result<(), String> {
    let name = validate_name(&name)?;
    let dir = workspace_dir(&app, &name)?;
    if !dir.is_dir() {
        return Err(format!("Database \"{name}\" does not exist"));
    }
    let db_path = dir.join(DB_FILE);
    if !db_path.exists() {
        web_store::init_database_at(&db_path)?;
    }
    checkpoint_database(&db_path)?;
    workspace_layout_dirs(&app, &name)?;
    write_active_file(&app, &name)?;
    let _ = app.emit(ACTIVE_CHANGED_EVENT, name);
    Ok(())
}

#[tauri::command]
pub fn db_rename(app: AppHandle, old_name: String, new_name: String) -> Result<(), String> {
    let old_name = validate_name(&old_name)?;
    let new_name = validate_name(&new_name)?;
    if old_name == new_name {
        return Ok(());
    }
    let from = workspace_dir(&app, &old_name)?;
    let to = workspace_dir(&app, &new_name)?;
    if !from.is_dir() {
        return Err(format!("Database \"{old_name}\" does not exist"));
    }
    if to.exists() {
        return Err(format!("Database \"{new_name}\" already exists"));
    }
    checkpoint_database(&from.join(DB_FILE))?;
    fs::rename(&from, &to).map_err(|error| error.to_string())?;

    if active_name(&app)? == old_name {
        write_active_file(&app, &new_name)?;
        let _ = app.emit(ACTIVE_CHANGED_EVENT, new_name);
    }
    Ok(())
}

#[tauri::command]
pub fn db_delete(app: AppHandle, name: String) -> Result<(), String> {
    let name = validate_name(&name)?;
    if active_name(&app)? == name {
        return Err("Cannot delete the active database. Switch to another one first.".to_string());
    }
    let dir = workspace_dir(&app, &name)?;
    if !dir.is_dir() {
        return Err(format!("Database \"{name}\" does not exist"));
    }
    fs::remove_dir_all(&dir).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn db_export(
    app: AppHandle,
    name: Option<String>,
    target_path: String,
) -> Result<String, String> {
    let name = match name {
        Some(name) => validate_name(&name)?,
        None => active_name(&app)?,
    };
    let source = workspace_dir(&app, &name)?;
    if !source.is_dir() {
        return Err(format!("Database \"{name}\" does not exist"));
    }
    checkpoint_database(&source.join(DB_FILE))?;
    let target = PathBuf::from(target_path.trim());
    if target.as_os_str().is_empty() {
        return Err("Choose a destination file for the export".to_string());
    }
    export_workspace_to_zip(&source, &target)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn db_import(app: AppHandle, zip_path: String, name: String) -> Result<(), String> {
    let name = validate_name(&name)?;
    let target = workspace_dir(&app, &name)?;
    if target.exists() {
        return Err(format!("Database \"{name}\" already exists"));
    }

    let root = workspaces_root(&app)?;
    let staging = root.join(format!(".import-{name}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;

    let outcome = (|| -> Result<(), String> {
        extract_zip(Path::new(&zip_path), &staging)?;
        let database_root = find_database_root(&staging)?;
        fs::rename(&database_root, &target).map_err(|error| error.to_string())?;
        Ok(())
    })();

    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    outcome?;

    web_store::init_database_at(&target.join(DB_FILE))?;
    workspace_layout_dirs(&app, &name)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("notian-db-manager-{label}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn validates_safe_database_names() {
        assert_eq!(validate_name(" trabajo ").unwrap(), "trabajo");
        assert!(validate_name("my-db_2").is_ok());
        assert!(validate_name("").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name("../escape").is_err());
        assert!(validate_name("with space").is_err());
        assert!(validate_name(&"a".repeat(MAX_NAME_LEN + 1)).is_err());
    }

    #[test]
    fn finds_database_root_at_zip_root_or_single_child() {
        let root = temp_dir("find-root");
        fs::write(root.join(DB_FILE), b"db").unwrap();
        assert_eq!(find_database_root(&root).unwrap(), root);

        let nested = temp_dir("find-nested");
        let child = nested.join("backup");
        fs::create_dir_all(&child).unwrap();
        fs::write(child.join(DB_FILE), b"db").unwrap();
        assert_eq!(find_database_root(&nested).unwrap(), child);

        let empty = temp_dir("find-empty");
        assert!(find_database_root(&empty).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(nested);
        let _ = fs::remove_dir_all(empty);
    }

    #[test]
    fn export_inside_the_workspace_does_not_include_the_archive() {
        let source = temp_dir("export-self");
        fs::write(source.join(DB_FILE), b"sqlite").unwrap();

        let zip_path = source.join("backup.zip");
        export_workspace_to_zip(&source, &zip_path).expect("export");

        let file = File::open(&zip_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|index| archive.by_index(index).unwrap().name().to_string())
            .collect();
        assert!(names.iter().any(|name| name == DB_FILE));
        assert!(!names.iter().any(|name| name.ends_with(".zip")));

        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn export_and_import_roundtrip_preserves_files() {
        let source = temp_dir("export-source");
        fs::create_dir_all(source.join(RAW_CONTENT_DIR)).unwrap();
        fs::create_dir_all(source.join(MEDIA_DIR).join("folder")).unwrap();
        fs::write(source.join(DB_FILE), b"sqlite").unwrap();
        fs::write(source.join(RAW_CONTENT_DIR).join("a.txt"), b"hello").unwrap();
        fs::write(source.join(MEDIA_DIR).join("folder").join("b.webp"), b"img").unwrap();

        let zip_path = std::env::temp_dir().join(format!(
            "notian-db-manager-export-{}.zip",
            uuid::Uuid::new_v4()
        ));
        export_workspace_to_zip(&source, &zip_path).expect("export");

        let staging = temp_dir("import-staging");
        extract_zip(&zip_path, &staging).expect("extract");
        let imported = find_database_root(&staging).expect("db root");
        assert_eq!(imported, staging);
        assert_eq!(fs::read(staging.join(DB_FILE)).unwrap(), b"sqlite");
        assert_eq!(
            fs::read(staging.join(RAW_CONTENT_DIR).join("a.txt")).unwrap(),
            b"hello"
        );
        assert!(staging.join(MEDIA_DIR).join("folder").join("b.webp").is_file());

        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(staging);
        let _ = fs::remove_file(zip_path);
    }
}
