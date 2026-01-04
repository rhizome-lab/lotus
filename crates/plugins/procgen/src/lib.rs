//! Procedural generation plugin for Viwo.
//!
//! Provides seeded random number generation and 2D Simplex noise.

use noise::{NoiseFn, Perlin};
use rand::{Rng, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;
use std::sync::Mutex;
use std::os::raw::c_int;

/// Global PRNG state
static PRNG: Mutex<Option<Xoshiro256PlusPlus>> = Mutex::new(None);

/// Global noise generator state
static NOISE: Mutex<Option<Perlin>> = Mutex::new(None);

/// Plugin initialization
#[no_mangle]
pub extern "C" fn plugin_init() -> c_int {
    let mut prng = PRNG.lock().unwrap();
    *prng = Some(Xoshiro256PlusPlus::seed_from_u64(12345));

    let mut noise = NOISE.lock().unwrap();
    *noise = Some(Perlin::new(12345));

    0 // Success
}

/// Plugin cleanup
#[no_mangle]
pub extern "C" fn plugin_cleanup() {
    let mut prng = PRNG.lock().unwrap();
    *prng = None;

    let mut noise = NOISE.lock().unwrap();
    *noise = None;
}

/// Seeds the PRNG and noise generator
#[no_mangle]
pub extern "C" fn procgen_seed(seed_val: u64) {
    let mut prng = PRNG.lock().unwrap();
    *prng = Some(Xoshiro256PlusPlus::seed_from_u64(seed_val));

    let mut noise = NOISE.lock().unwrap();
    *noise = Some(Perlin::new(seed_val as u32));
}

/// Generates 2D Simplex noise (-1.0 to 1.0)
#[no_mangle]
pub extern "C" fn procgen_noise(x: f64, y: f64) -> f64 {
    let noise_gen = NOISE.lock().unwrap();
    if let Some(ref gen) = *noise_gen {
        gen.get([x, y])
    } else {
        0.0
    }
}

/// Generates random float (0.0 to 1.0)
#[no_mangle]
pub extern "C" fn procgen_random() -> f64 {
    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        rng.gen()
    } else {
        0.0
    }
}

/// Generates random float in range [min, max)
#[no_mangle]
pub extern "C" fn procgen_random_range(min: f64, max: f64) -> f64 {
    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        rng.gen_range(min..max)
    } else {
        min
    }
}

/// Generates random integer in range [min, max] (inclusive)
/// Returns -1 on error
#[no_mangle]
pub extern "C" fn procgen_between(min: i64, max: i64) -> i64 {
    if min > max {
        return -1; // Error
    }

    let mut prng = PRNG.lock().unwrap();
    if let Some(ref mut rng) = *prng {
        rng.gen_range(min..=max)
    } else {
        min
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_determinism() {
        plugin_init();
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
        plugin_init();
        procgen_seed(100);
        let n1 = procgen_noise(1.0, 2.0);

        procgen_seed(100);
        let n2 = procgen_noise(1.0, 2.0);

        assert_eq!(n1, n2);
    }

    #[test]
    fn test_between() {
        plugin_init();
        procgen_seed(999);
        for _ in 0..100 {
            let val = procgen_between(1, 10);
            assert!(val >= 1 && val <= 10);
        }
    }

    #[test]
    fn test_random_range() {
        plugin_init();
        procgen_seed(777);
        for _ in 0..100 {
            let val = procgen_random_range(0.0, 10.0);
            assert!(val >= 0.0 && val < 10.0);
        }
    }
}
