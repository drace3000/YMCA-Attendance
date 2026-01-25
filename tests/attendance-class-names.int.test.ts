import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

function createNoSessionClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

describe('attendance (integration): class names resolve', () => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const hasEnv = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
  const testIt = hasEnv ? it : it.skip;

  testIt('class_ids used by sessions resolve to non-empty class names (authenticated can read classes)', async () => {
    const admin = createNoSessionClient(supabaseUrl!, supabaseServiceRoleKey!);
    const publicClient = createNoSessionClient(supabaseUrl!, supabaseAnonKey!);

    // Sample session links (service role bypasses RLS so we can reliably sample).
    const { data: links, error: linkErr } = await admin
      .from('session_instructors')
      .select('session_id, instructor_id, class_sessions(id, class_id)')
      .limit(50);

    expect(linkErr).toBeNull();
    expect(Array.isArray(links)).toBe(true);
    expect((links ?? []).length).toBeGreaterThan(0);

    const classIds = new Set<string>();
    for (const row of links as any[]) {
      const cs = Array.isArray(row?.class_sessions) ? row.class_sessions[0] : row.class_sessions;
      const classId = cs?.class_id ? String(cs.class_id) : '';
      expect(classId).not.toBe('');
      if (classId) classIds.add(classId);
    }

    const uniqClassIds = Array.from(classIds);
    expect(uniqClassIds.length).toBeGreaterThan(0);

    // Create a temporary authenticated user and verify they can read `classes` under RLS.
    // This matches the app's runtime role (`authenticated`) without requiring a real instructor account.
    const email = `vitest.${Date.now()}@example.test`;
    const password = `Vitest!${Math.random().toString(16).slice(2)}Aa1`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    const userId = created?.user?.id;
    expect(userId).toBeTruthy();

    const { data: signInData, error: signInErr } = await publicClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(signInErr).toBeNull();
    expect(signInData.session?.access_token).toBeTruthy();

    // Now that we're signed in, reads run as role=authenticated.
    const authed = publicClient;
    const { data: classRows, error: classErr } = await authed.from('classes').select('id, name').in('id', uniqClassIds);
    expect(classErr).toBeNull();
    expect((classRows ?? []).length).toBeGreaterThan(0);

    const nameById = new Map<string, string>();
    for (const r of classRows as any[]) {
      if (!r?.id) continue;
      nameById.set(String(r.id), String(r.name ?? ''));
    }

    const missing: string[] = [];
    for (const id of uniqClassIds) {
      const name = nameById.get(id) ?? '';
      if (!String(name).trim()) missing.push(id);
    }

    // If this fails, the attendance UI can fall back to "Unknown class".
    expect(missing).toEqual([]);

    // Cleanup the temp user (best-effort).
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  });
});

