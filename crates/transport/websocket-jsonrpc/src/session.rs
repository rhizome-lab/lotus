//! Client session management.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};

use rhizome_lotus_core::EntityId;

/// Unique session identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SessionId(u64);

impl SessionId {
    /// Generate a new unique session ID.
    pub fn new() -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(1);
        Self(COUNTER.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for SessionId {
    fn default() -> Self {
        Self::new()
    }
}

/// Represents a connected client session.
#[derive(Debug)]
pub struct Session {
    /// Unique session identifier.
    pub id: SessionId,
    /// Client's network address.
    pub addr: SocketAddr,
    /// The player entity ID (if logged in).
    pub player_id: Option<EntityId>,
    /// Current room the player is in.
    pub room_id: Option<EntityId>,
    /// Capabilities the session has been granted.
    pub capabilities: Vec<String>,
}

impl Session {
    /// Create a new session for a client.
    pub fn new(id: SessionId, addr: SocketAddr) -> Self {
        Self {
            id,
            addr,
            player_id: None,
            room_id: None,
            capabilities: Vec::new(),
        }
    }

    /// Check if the session is logged in.
    pub fn is_logged_in(&self) -> bool {
        self.player_id.is_some()
    }

    /// Log in the session with a player entity.
    pub fn login(&mut self, player_id: EntityId, room_id: EntityId) {
        self.player_id = Some(player_id);
        self.room_id = Some(room_id);
    }

    /// Log out the session.
    pub fn logout(&mut self) {
        self.player_id = None;
        self.room_id = None;
        self.capabilities.clear();
    }

    /// Grant a capability to the session.
    pub fn grant_capability(&mut self, capability: String) {
        if !self.capabilities.contains(&capability) {
            self.capabilities.push(capability);
        }
    }

    /// Check if the session has a capability.
    pub fn has_capability(&self, capability: &str) -> bool {
        self.capabilities.iter().any(|c| c == capability)
    }
}
