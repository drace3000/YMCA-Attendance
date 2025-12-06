#!/usr/bin/env node

// Create the nickname_exists RPC in Supabase using the Postgres SQL HTTP endpoint.
// Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL in env.

const fs = require('fs');
const fetch = require('node-fetch');

function loadEnv() {
  const env = { ...process.env };
  try {
    fs.readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim();
      });
  } catch (_) {
    // ignore missing .env
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const m = url.match(/https?:\/\/(.*?)\.supabase\.co/);
  if (!m) {
    console.error('Could not parse project ref from URL');
    process.exit(1);
  }
  const projectRef = m[1];
  // Use Supabase management API to run SQL (works with service role key).
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  const sql = `
create or replace function public.nickname_exists(p_branch_id uuid, p_nickname text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.instructors
    where branch_id = p_branch_id
      and nickname = p_nickname
  );
$$;
revoke all on function public.nickname_exists from public;
grant execute on function public.nickname_exists to anon, authenticated;
`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  console.log('status', res.status);
  console.log(text);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

