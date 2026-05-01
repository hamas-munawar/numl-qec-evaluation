/**
 * @module env
 * Environment configuration for NUML QEC Evaluation extension.
 *
 * DEV_MODE = true  → All "submit" actions become fill-only (safe for testing)
 * DEV_MODE = false → Normal production behaviour — forms are submitted
 *
 * ⚠️  Change this to false before your real evaluation run.
 */
export const DEV_MODE = false;
