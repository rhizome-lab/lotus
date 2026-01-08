//! Scheduler integration tests.
//!
//! FIXME: The scheduler API has changed to be async with callbacks.
//! These tests need to be rewritten to use #[tokio::test] and the new API.
//! The process() method now takes a callback instead of returning tasks.

// Tests are temporarily disabled until rewritten for new async API.
// See lotus_core::Scheduler for the new API.
