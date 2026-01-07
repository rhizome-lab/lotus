//! Diffusers plugin for Viwo.
//!
//! Provides Stable Diffusion image generation using burn-models.
//!
//! # Opcodes
//!
//! - `diffusers.generate` - Generate image from text prompt
//! - `diffusers.img2img` - Transform image based on prompt
//! - `diffusers.load` - Load a model into memory
//! - `diffusers.unload` - Unload a model from memory

use image::{ImageBuffer, Rgb};
use mlua::ffi::lua_State;
use std::ffi::{c_char, c_int, CStr, CString};
use std::os::raw::c_void;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use thiserror::Error;

/// Plugin errors
#[derive(Error, Debug)]
pub enum DiffusersError {
    #[error("Model not loaded: {0}")]
    ModelNotLoaded(String),

    #[error("Failed to load model: {0}")]
    LoadError(String),

    #[error("Generation failed: {0}")]
    GenerationError(String),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Image error: {0}")]
    ImageError(#[from] image::ImageError),
}

/// Generation configuration
#[derive(Debug, Clone)]
pub struct GenerateConfig {
    pub prompt: String,
    pub negative_prompt: String,
    pub width: usize,
    pub height: usize,
    pub steps: usize,
    pub guidance_scale: f64,
    pub seed: Option<u64>,
    pub output_path: Option<PathBuf>,
}

impl Default for GenerateConfig {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            negative_prompt: String::new(),
            width: 512,
            height: 512,
            steps: 30,
            guidance_scale: 7.5,
            seed: None,
            output_path: None,
        }
    }
}

/// Supported model types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelType {
    Sd1x,
    Sdxl,
}

impl ModelType {
    fn native_resolution(&self) -> (usize, usize) {
        match self {
            ModelType::Sd1x => (512, 512),
            ModelType::Sdxl => (1024, 1024),
        }
    }
}

/// Model registry for caching loaded models
struct ModelRegistry {
    // In a real implementation, this would hold the actual model instances
    // For now, just track which models are "loaded"
    loaded_models: std::collections::HashMap<String, ModelType>,
    weights_paths: std::collections::HashMap<String, PathBuf>,
}

impl ModelRegistry {
    fn new() -> Self {
        Self {
            loaded_models: std::collections::HashMap::new(),
            weights_paths: std::collections::HashMap::new(),
        }
    }

    fn load(&mut self, name: &str, model_type: ModelType, weights_path: PathBuf) {
        self.loaded_models.insert(name.to_string(), model_type);
        self.weights_paths.insert(name.to_string(), weights_path);
    }

    fn unload(&mut self, name: &str) -> bool {
        self.loaded_models.remove(name).is_some() && self.weights_paths.remove(name).is_some()
    }

    fn get(&self, name: &str) -> Option<(ModelType, &PathBuf)> {
        self.loaded_models
            .get(name)
            .zip(self.weights_paths.get(name))
            .map(|(t, p)| (*t, p))
    }

    fn list(&self) -> Vec<String> {
        self.loaded_models.keys().cloned().collect()
    }
}

static REGISTRY: OnceLock<Mutex<ModelRegistry>> = OnceLock::new();

fn registry() -> &'static Mutex<ModelRegistry> {
    REGISTRY.get_or_init(|| Mutex::new(ModelRegistry::new()))
}

/// Load a model into the registry
pub fn load_model(name: &str, model_type: &str, weights_path: &str) -> Result<(), DiffusersError> {
    let model_type = match model_type.to_lowercase().as_str() {
        "sd1x" | "sd1.x" | "sd1" => ModelType::Sd1x,
        "sdxl" => ModelType::Sdxl,
        _ => {
            return Err(DiffusersError::InvalidParameter(format!(
                "Unknown model type: {}. Supported: sd1x, sdxl",
                model_type
            )))
        }
    };

    let path = PathBuf::from(weights_path);
    if !path.exists() {
        return Err(DiffusersError::LoadError(format!(
            "Weights path does not exist: {}",
            weights_path
        )));
    }

    let mut reg = registry().lock().unwrap();
    reg.load(name, model_type, path);

    Ok(())
}

/// Unload a model from the registry
pub fn unload_model(name: &str) -> bool {
    let mut reg = registry().lock().unwrap();
    reg.unload(name)
}

/// List loaded models
pub fn list_models() -> Vec<String> {
    let reg = registry().lock().unwrap();
    reg.list()
}

/// Generate an image (stub implementation - actual generation requires backend setup)
pub fn generate(model_name: &str, config: &GenerateConfig) -> Result<Vec<u8>, DiffusersError> {
    let reg = registry().lock().unwrap();

    let (_model_type, _weights_path) = reg
        .get(model_name)
        .ok_or_else(|| DiffusersError::ModelNotLoaded(model_name.to_string()))?;

    // Placeholder: In a full implementation, this would:
    // 1. Initialize the burn backend
    // 2. Load the model weights
    // 3. Run the diffusion pipeline
    // 4. Return the generated image bytes

    // For now, generate a placeholder gradient image
    let width = config.width as u32;
    let height = config.height as u32;
    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let r = (x as f32 / width as f32 * 255.0) as u8;
        let g = (y as f32 / height as f32 * 255.0) as u8;
        let b = 128u8;
        *pixel = Rgb([r, g, b]);
    }

    // Encode as PNG
    let mut buffer = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut buffer);
        encoder.write_image(img.as_raw(), width, height, image::ExtendedColorType::Rgb8)?;
    }

    // Optionally save to file
    if let Some(path) = &config.output_path {
        img.save(path)?;
    }

    Ok(buffer)
}

// ============================================================================
// Plugin ABI
// ============================================================================

type RegisterFunction = unsafe extern "C" fn(name: *const c_char, func: *const c_void) -> c_int;

/// Plugin initialization
#[unsafe(no_mangle)]
pub unsafe extern "C" fn diffusers_plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = [
            "diffusers.load",
            "diffusers.unload",
            "diffusers.generate",
            "diffusers.list",
        ];
        let funcs: [*const c_void; 4] = [
            diffusers_load_lua as *const c_void,
            diffusers_unload_lua as *const c_void,
            diffusers_generate_lua as *const c_void,
            diffusers_list_lua as *const c_void,
        ];

        for (name, func) in names.iter().zip(funcs.iter()) {
            let cname = CString::new(*name).unwrap();
            if register_fn(cname.as_ptr(), *func) != 0 {
                return -1;
            }
        }
        0 // Success
    }
}

/// Plugin cleanup
#[unsafe(no_mangle)]
pub unsafe extern "C" fn diffusers_plugin_cleanup() -> c_int {
    // Clear the model registry
    if let Some(reg) = REGISTRY.get() {
        let mut guard = reg.lock().unwrap();
        guard.loaded_models.clear();
        guard.weights_paths.clear();
    }
    0 // Success
}

// ============================================================================
// Lua FFI Functions
// ============================================================================

unsafe fn lua_push_error(lua: *mut lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let cmsg = CString::new(msg).unwrap_or_else(|_| CString::new("error").unwrap());
    lua_pushnil(lua);
    lua_pushstring(lua, cmsg.as_ptr());
    2
}

unsafe fn lua_get_string(lua: *mut lua_State, idx: c_int) -> Option<String> {
    use mlua::ffi::*;
    if lua_type(lua, idx) != LUA_TSTRING {
        return None;
    }
    let ptr = lua_tolstring(lua, idx, std::ptr::null_mut());
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string())
}

unsafe fn lua_get_table_string(lua: *mut lua_State, idx: c_int, key: &str) -> Option<String> {
    use mlua::ffi::*;
    let ckey = CString::new(key).ok()?;
    lua_getfield(lua, idx, ckey.as_ptr());
    let result = lua_get_string(lua, -1);
    lua_pop(lua, 1);
    result
}

unsafe fn lua_get_table_number(lua: *mut lua_State, idx: c_int, key: &str) -> Option<f64> {
    use mlua::ffi::*;
    let ckey = CString::new(key).ok()?;
    lua_getfield(lua, idx, ckey.as_ptr());
    let result = if lua_type(lua, -1) == LUA_TNUMBER {
        Some(lua_tonumberx(lua, -1, std::ptr::null_mut()))
    } else {
        None
    };
    lua_pop(lua, 1);
    result
}

/// diffusers.load(name, model_type, weights_path)
unsafe extern "C" fn diffusers_load_lua(lua: *mut lua_State) -> c_int {
    use mlua::ffi::*;

    let name = match lua_get_string(lua, 1) {
        Some(s) => s,
        None => return lua_push_error(lua, "diffusers.load: missing model name (arg 1)"),
    };

    let model_type = match lua_get_string(lua, 2) {
        Some(s) => s,
        None => return lua_push_error(lua, "diffusers.load: missing model_type (arg 2)"),
    };

    let weights_path = match lua_get_string(lua, 3) {
        Some(s) => s,
        None => return lua_push_error(lua, "diffusers.load: missing weights_path (arg 3)"),
    };

    match load_model(&name, &model_type, &weights_path) {
        Ok(()) => {
            lua_pushboolean(lua, 1);
            1
        }
        Err(e) => lua_push_error(lua, &e.to_string()),
    }
}

/// diffusers.unload(name)
unsafe extern "C" fn diffusers_unload_lua(lua: *mut lua_State) -> c_int {
    use mlua::ffi::*;

    let name = match lua_get_string(lua, 1) {
        Some(s) => s,
        None => return lua_push_error(lua, "diffusers.unload: missing model name"),
    };

    let removed = unload_model(&name);
    lua_pushboolean(lua, if removed { 1 } else { 0 });
    1
}

/// diffusers.generate(model_name, config) -> png_bytes
unsafe extern "C" fn diffusers_generate_lua(lua: *mut lua_State) -> c_int {
    use mlua::ffi::*;

    let model_name = match lua_get_string(lua, 1) {
        Some(s) => s,
        None => return lua_push_error(lua, "diffusers.generate: missing model name (arg 1)"),
    };

    // Parse config table (arg 2)
    let mut config = GenerateConfig::default();

    if lua_type(lua, 2) == LUA_TTABLE {
        if let Some(prompt) = lua_get_table_string(lua, 2, "prompt") {
            config.prompt = prompt;
        }
        if let Some(neg) = lua_get_table_string(lua, 2, "negative_prompt") {
            config.negative_prompt = neg;
        }
        if let Some(neg) = lua_get_table_string(lua, 2, "negative") {
            config.negative_prompt = neg;
        }
        if let Some(w) = lua_get_table_number(lua, 2, "width") {
            config.width = w as usize;
        }
        if let Some(h) = lua_get_table_number(lua, 2, "height") {
            config.height = h as usize;
        }
        if let Some(s) = lua_get_table_number(lua, 2, "steps") {
            config.steps = s as usize;
        }
        if let Some(g) = lua_get_table_number(lua, 2, "guidance_scale") {
            config.guidance_scale = g;
        }
        if let Some(g) = lua_get_table_number(lua, 2, "guidance") {
            config.guidance_scale = g;
        }
        if let Some(seed) = lua_get_table_number(lua, 2, "seed") {
            config.seed = Some(seed as u64);
        }
        if let Some(path) = lua_get_table_string(lua, 2, "output_path") {
            config.output_path = Some(PathBuf::from(path));
        }
        if let Some(path) = lua_get_table_string(lua, 2, "output") {
            config.output_path = Some(PathBuf::from(path));
        }
    }

    if config.prompt.is_empty() {
        return lua_push_error(lua, "diffusers.generate: config.prompt is required");
    }

    match generate(&model_name, &config) {
        Ok(bytes) => {
            // Push as Lua string (binary data)
            lua_pushlstring(lua, bytes.as_ptr() as *const c_char, bytes.len());
            1
        }
        Err(e) => lua_push_error(lua, &e.to_string()),
    }
}

/// diffusers.list() -> array of model names
unsafe extern "C" fn diffusers_list_lua(lua: *mut lua_State) -> c_int {
    use mlua::ffi::*;

    let models = list_models();

    lua_createtable(lua, models.len() as c_int, 0);
    for (idx, name) in models.iter().enumerate() {
        let cname = CString::new(name.as_str()).unwrap();
        lua_pushstring(lua, cname.as_ptr());
        lua_rawseti(lua, -2, (idx + 1) as i64);
    }
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_and_list_models() {
        // Clear any existing state
        if let Some(reg) = REGISTRY.get() {
            let mut guard = reg.lock().unwrap();
            guard.loaded_models.clear();
            guard.weights_paths.clear();
        }

        // Create a temp file as weights
        let temp_dir = std::env::temp_dir();
        let weights_path = temp_dir.join("test_weights.safetensors");
        std::fs::write(&weights_path, b"fake").unwrap();

        // Load model
        let result = load_model("test", "sd1x", weights_path.to_str().unwrap());
        assert!(result.is_ok());

        // List models
        let models = list_models();
        assert!(models.contains(&"test".to_string()));

        // Unload
        assert!(unload_model("test"));
        assert!(!list_models().contains(&"test".to_string()));

        // Cleanup
        std::fs::remove_file(weights_path).ok();
    }
}
