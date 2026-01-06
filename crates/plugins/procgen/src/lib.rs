//! Procedural generation plugin for Viwo.
//!
//! Provides seeded random number generation and 2D Simplex noise.

use noise::{NoiseFn, Perlin};
use rand::{Rng, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::sync::Mutex;

type RegisterFunction = unsafe extern "C" fn(*const c_char, PluginLuaFunction) -> c_int;
type PluginLuaFunction = unsafe extern "C" fn(*mut mlua::ffi::lua_State) -> c_int;

/// Global PRNG state
static PRNG: Mutex<Option<Xoshiro256PlusPlus>> = Mutex::new(None);

/// Global noise generator state
static NOISE: Mutex<Option<Perlin>> = Mutex::new(None);

/// Initialize plugin state
fn init_state() {
    let mut prng = PRNG.lock().unwrap();
    *prng = Some(Xoshiro256PlusPlus::seed_from_u64(12345));

    let mut noise = NOISE.lock().unwrap();
    *noise = Some(Perlin::new(12345));
}

/// Clear plugin state
fn clear_state() {
    let mut prng = PRNG.lock().unwrap();
    *prng = None;

    let mut noise = NOISE.lock().unwrap();
    *noise = None;
}

/// Seeds the PRNG and noise generator
fn procgen_seed(seed_val: u64) {
    let mut prng = PRNG.lock().unwrap();
    *prng = Some(Xoshiro256PlusPlus::seed_from_u64(seed_val));

    let mut noise = NOISE.lock().unwrap();
    *noise = Some(Perlin::new(seed_val as u32));
}

/// Generates 2D Simplex noise (-1.0 to 1.0)
fn procgen_noise(x: f64, y: f64) -> f64 {
    let noise_gen = NOISE.lock().unwrap();
    if let Some(ref gen) = *noise_gen {
        gen.get([x, y])
    } else {
        0.0
    }
}

/// Generates random float (0.0 to 1.0)
fn procgen_random() -> f64 {
    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        rng.gen()
    } else {
        0.0
    }
}

/// Generates random float in range [min, max)
fn procgen_random_range(min: f64, max: f64) -> f64 {
    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        rng.gen_range(min..max)
    } else {
        min
    }
}

/// Generates random integer in range [min, max] (inclusive)
fn procgen_between(min: i64, max: i64) -> Result<i64, String> {
    if min > max {
        return Err("procgen.between: min must be <= max".to_string());
    }

    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        Ok(rng.gen_range(min..=max))
    } else {
        Ok(min)
    }
}

// ============================================================================
// Lua C API Integration
// ============================================================================

/// Helper: Push error message to Lua stack
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg = CString::new(msg).unwrap_or_else(|_| CString::new("Error message contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

/// Lua wrapper for procgen.seed
#[unsafe(no_mangle)]
unsafe extern "C" fn procgen_seed_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 1 {
        return lua_push_error(L, "procgen.seed requires 1 argument (seed)");
    }

    let seed_val = lua_tointeger(L, 1) as u64;
    procgen_seed(seed_val);
    0 // No return values
}

/// Lua wrapper for procgen.noise
#[unsafe(no_mangle)]
unsafe extern "C" fn procgen_noise_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "procgen.noise requires 2 arguments (x, y)");
    }

    let x = lua_tonumber(L, 1);
    let y = lua_tonumber(L, 2);
    let result = procgen_noise(x, y);
    lua_pushnumber(L, result);
    1
}

/// Lua wrapper for procgen.random
#[unsafe(no_mangle)]
unsafe extern "C" fn procgen_random_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 0 {
        return lua_push_error(L, "procgen.random requires 0 arguments");
    }

    let result = procgen_random();
    lua_pushnumber(L, result);
    1
}

/// Lua wrapper for procgen.randomRange
#[unsafe(no_mangle)]
unsafe extern "C" fn procgen_random_range_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "procgen.randomRange requires 2 arguments (min, max)");
    }

    let min = lua_tonumber(L, 1);
    let max = lua_tonumber(L, 2);
    let result = procgen_random_range(min, max);
    lua_pushnumber(L, result);
    1
}

/// Lua wrapper for procgen.between
#[unsafe(no_mangle)]
unsafe extern "C" fn procgen_between_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "procgen.between requires 2 arguments (min, max)");
    }

    let min = lua_tointeger(L, 1);
    let max = lua_tointeger(L, 2);

    match procgen_between(min, max) {
        Ok(result) => {
            lua_pushinteger(L, result);
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Plugin initialization - register all functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    // Initialize plugin state
    init_state();

    // Register functions
    unsafe {
        let names = [
            "procgen.seed",
            "procgen.noise",
            "procgen.random",
            "procgen.randomRange",
            "procgen.between",
        ];
        let funcs: [PluginLuaFunction; 5] = [
            procgen_seed_lua,
            procgen_noise_lua,
            procgen_random_lua,
            procgen_random_range_lua,
            procgen_between_lua,
        ];

        for (name, func) in names.iter().zip(funcs.iter()) {
            let name_cstr = match CString::new(*name) {
                Ok(s) => s,
                Err(_) => return -1,
            };
            if register_fn(name_cstr.as_ptr(), *func) != 0 {
                return -1;
            }
        }
    }
    0 // Success
}

/// Plugin cleanup - called when unloading
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_cleanup() -> c_int {
    clear_state();
    0 // Success
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_determinism() {
        init_state();
        procgen_seed(42);
        let a = procgen_random();
        let b = procgen_random();

        procgen_seed(42);
        let c = procgen_random();
        let d = procgen_random();

        assert_eq!(a, c);
        assert_eq!(b, d);
    }

    #[test]
    fn test_noise_determinism() {
        init_state();
        procgen_seed(100);
        let n1 = procgen_noise(1.0, 2.0);

        procgen_seed(100);
        let n2 = procgen_noise(1.0, 2.0);

        assert_eq!(n1, n2);
    }

    #[test]
    fn test_between() {
        init_state();
        procgen_seed(999);
        for _ in 0..100 {
            let val = procgen_between(1, 10).unwrap();
            assert!(val >= 1 && val <= 10);
        }
    }

    #[test]
    fn test_random_range() {
        init_state();
        procgen_seed(777);
        for _ in 0..100 {
            let val = procgen_random_range(0.0, 10.0);
            assert!(val >= 0.0 && val < 10.0);
        }
    }
}
