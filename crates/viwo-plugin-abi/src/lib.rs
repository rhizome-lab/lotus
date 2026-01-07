//! Stable ABI for Viwo plugins.
//!
//! Plugins are dynamic libraries that register opcodes with the runtime.

use abi_stable::{
    StableAbi, sabi_trait,
    std_types::{RResult, RStr, RString},
};

/// Plugin version.
#[derive(Debug, Clone, Copy, StableAbi)]
#[repr(C)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Version {
    pub const fn new(major: u32, minor: u32, patch: u32) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }
}

/// Plugin error.
#[derive(Debug, Clone, StableAbi)]
#[repr(C)]
pub struct PluginError {
    pub message: RString,
}

impl PluginError {
    pub fn new(message: impl Into<RString>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// Result type for plugin operations.
pub type PluginResult<T> = RResult<T, PluginError>;

/// Plugin trait that all plugins must implement.
#[sabi_trait]
pub trait Plugin: Send + Sync {
    /// Plugin name.
    fn name(&self) -> RStr<'static>;

    /// Plugin version.
    fn version(&self) -> Version;

    /// Called when the plugin is loaded.
    fn on_load(&self) -> PluginResult<()>;

    /// Called when the plugin is unloaded.
    fn on_unload(&self) -> PluginResult<()>;
}
