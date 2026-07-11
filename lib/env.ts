export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isDemoModeEnabled(): boolean {
  if (process.env.ENABLE_DEMO_MODE !== undefined) {
    return process.env.ENABLE_DEMO_MODE === "true";
  }

  return process.env.NODE_ENV !== "production";
}
