//! Plugin loading system for Viwo.
//!
//! Loads dynamic libraries (.so, .dll, .dylib) and registers their opcodes.

use std::os::raw::c_int;
use libloading::{Library, Symbol};

/// A loaded plugin with its opcode symbols
pub struct LoadedPlugin {
    _lib: Library,
    name: String,
}

impl LoadedPlugin {
    /// Load a plugin from a dynamic library path
    pub fn load(path: &str, name: &str) -> Result<Self, String> {
        unsafe {
            let lib = Library::new(path)
                .map_err(|e| format!("Failed to load plugin {}: {}", name, e))?;

            // Call plugin_init
            let init_fn: Symbol<extern "C" fn() -> c_int> = lib
                .get(b"plugin_init")
                .map_err(|e| format!("Plugin {} missing plugin_init: {}", name, e))?;

            let result = init_fn();
            if result != 0 {
                return Err(format!("Plugin {} init failed with code {}", name, result));
            }

            Ok(Self {
                _lib: lib,
                name: name.to_string(),
            })
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

impl Drop for LoadedPlugin {
    fn drop(&mut self) {
        unsafe {
            // Call plugin_cleanup if it exists
            if let Ok(cleanup_fn) = self._lib.get::<Symbol<extern "C" fn()>>(b"plugin_cleanup") {
                cleanup_fn();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_loading() {
        // Build the procgen plugin first
        let status = std::process::Command::new("cargo")
            .args(&["build", "--package", "viwo-plugin-procgen"])
            .status()
            .expect("Failed to build procgen plugin");

        assert!(status.success());

        // Try to load it - use absolute path from project root
        let mut plugin_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        plugin_path.pop(); // Go to workspace root
        plugin_path.pop();
        plugin_path.push("target/debug");

        if cfg!(target_os = "macos") {
            plugin_path.push("libviwo_plugin_procgen.dylib");
        } else if cfg!(target_os = "windows") {
            plugin_path.push("viwo_plugin_procgen.dll");
        } else {
            plugin_path.push("libviwo_plugin_procgen.so");
        }

        let plugin = LoadedPlugin::load(plugin_path.to_str().unwrap(), "procgen");
        if let Err(e) = &plugin {
            eprintln!("Plugin loading error: {}", e);
        }
        assert!(plugin.is_ok());
    }
}
