import { config as loadEnv } from 'dotenv';

// Load workspace `.env` so integration tests can use Supabase keys.
// Vitest runs in Node and does not automatically load Expo env files.
loadEnv();

