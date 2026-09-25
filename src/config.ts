/**
 * Public connection settings for the v2 Supabase project (never the old one).
 * The publishable key is designed to ship inside apps: every table is closed
 * (RLS on, no grants) and the app can only call authenticated,
 * permission-checked database functions.
 */
export const SUPABASE_URL = "https://vmlizevbfssqmcpknobe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9RBdfRwndm3Wkklmtc5AAg_dFRaL4HA";
