//! Entity system, capabilities, and storage for Viwo.

pub mod capability;
pub mod entity;
pub mod storage;

pub use capability::{cap_types, Capability};
pub use entity::{Entity, EntityId, Verb};
pub use storage::{StorageError, WorldStorage};
