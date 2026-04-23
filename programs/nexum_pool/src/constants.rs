// ── Timing parameters (ProtocolConfig defaults) ───────────────────────
pub const MIN_INIT_WINDOW: i64 = 30;   // seconds
pub const MAX_INIT_WINDOW: i64 = 60;   // seconds
pub const EXECUTE_WINDOW: i64 = 120;   // seconds (design doc says 30-120, using 120)
pub const CLOCK_TOLERANCE: i64 = 5;    // seconds
pub const MAX_VERSION_SLOTS: u8 = 20;
pub const SLOT_EXPIRE_SECONDS: i64 = 600; // 10 minutes for unused version slots
