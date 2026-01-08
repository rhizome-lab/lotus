//! Dynamic plugin loading system for Bloom.

use libloading::{Library, Symbol};
use std::os::raw::c_int;
use std::path::Path;

/// Plugin registry that manages loaded plugins
pub struct PluginRegistry {
    plugins: Vec<LoadedPlugin>,
}

/// A dynamically loaded plugin
pub struct LoadedPlugin {
    _lib: Library, // Keep library alive
    name: String,
}

impl PluginRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
        }
    }

    /// Load a plugin from a .so/.dll/.dylib file
    ///
    /// The plugin's `plugin_init` function will be called with the registration callback.
    pub fn load_plugin(&mut self, path: impl AsRef<Path>, name: &str) -> Result<(), String> {
        unsafe {
            let lib = Library::new(path.as_ref())
                .map_err(|e| format!("Failed to load plugin {}: {}", name, e))?;

            // Type for the registration callback
            type RegisterFunction = unsafe extern "C" fn(
                name: *const std::os::raw::c_char,
                func: crate::plugin_registry::PluginLuaFunction,
            ) -> c_int;

            // Call bloom_{name}_plugin_init with the registration callback
            let init_symbol = format!("bloom_{}_plugin_init", name);
            let init_fn: Symbol<extern "C" fn(RegisterFunction) -> c_int> = lib
                .get(init_symbol.as_bytes())
                .map_err(|e| format!("Plugin {} missing {}: {}", name, init_symbol, e))?;

            let result = init_fn(crate::plugin_registry::register_plugin_function);
            if result != 0 {
                return Err(format!("Plugin {} init failed with code {}", name, result));
            }

            self.plugins.push(LoadedPlugin {
                _lib: lib,
                name: name.to_string(),
            });

            Ok(())
        }
    }

    /// Get a plugin by name
    pub fn get_plugin(&self, name: &str) -> Option<&LoadedPlugin> {
        self.plugins.iter().find(|p| p.name == name)
    }

    /// Get a function symbol from a loaded plugin
    pub unsafe fn get_symbol<T>(
        &self,
        plugin_name: &str,
        symbol_name: &[u8],
    ) -> Result<Symbol<'_, T>, String> {
        let plugin = self
            .get_plugin(plugin_name)
            .ok_or_else(|| format!("Plugin {} not loaded", plugin_name))?;

        unsafe {
            plugin._lib.get(symbol_name).map_err(|e| {
                format!(
                    "Symbol {:?} not found in plugin {}: {}",
                    std::str::from_utf8(symbol_name).unwrap_or("???"),
                    plugin_name,
                    e
                )
            })
        }
    }

    /// Get a raw function pointer from a loaded plugin
    /// The pointer is valid as long as the plugin remains loaded
    pub unsafe fn get_function_ptr<T: Copy>(
        &self,
        plugin_name: &str,
        symbol_name: &[u8],
    ) -> Result<T, String> {
        unsafe {
            let symbol: Symbol<T> = self.get_symbol(plugin_name, symbol_name)?;
            Ok(*symbol) // Deref to get raw function pointer
        }
    }
}

impl Drop for PluginRegistry {
    fn drop(&mut self) {
        // Call plugin_cleanup for each plugin
        for plugin in &self.plugins {
            unsafe {
                if let Ok(cleanup_fn) = plugin
                    ._lib
                    .get::<Symbol<extern "C" fn()>>(b"plugin_cleanup")
                {
                    cleanup_fn();
                }
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
            .args(&["build", "--package", "bloom-plugin-procgen"])
            .status()
            .expect("Failed to build procgen plugin");

        assert!(status.success());

        // Get plugin path
        let mut plugin_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        plugin_path.pop();
        plugin_path.pop();
        plugin_path.push("target/debug");

        if cfg!(target_os = "macos") {
            plugin_path.push("liblotus_plugin_procgen.dylib");
        } else if cfg!(target_os = "windows") {
            plugin_path.push("lotus_plugin_procgen.dll");
        } else {
            plugin_path.push("liblotus_plugin_procgen.so");
        }

        // Load plugin
        let mut registry = PluginRegistry::new();
        let result = registry.load_plugin(&plugin_path, "procgen");
        if let Err(e) = &result {
            eprintln!("Plugin loading error: {}", e);
        }
        assert!(result.is_ok());

        // Test getting a symbol
        unsafe {
            let seed_fn = registry.get_symbol::<extern "C" fn(u64)>("procgen", b"procgen_seed");
            assert!(seed_fn.is_ok());
        }
    }
}
