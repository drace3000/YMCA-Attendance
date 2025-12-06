#!/usr/bin/env node

/**
 * Import GroupX_TM_MonSun_fixed.csv into Supabase tables.
 *
 * Steps:
 * 1) Upsert classes (distinct Class)
 * 2) Upsert locations (distinct LocationCode + LocationName)
 * 3) Upsert instructors (split on "/" for multi-instructor rows), keep raw_name, parse simple first/last
 * 4) Parse times (fix common typos) into start_time/end_time; keep original_time_text
 * 5) Insert class_sessions with provided schedule_id
 * 6) Link session_instructors
 *
 * Prereqs:
 * - CSV at documents/GroupX_TM_MonSun_fixed.csv
 * - Supabase service role key in env SUPABASE_SERVICE_ROLE_KEY
 * - Supabase project URL in env SUPABASE_URL
 *
 * Usage:
 *   node scripts/import-groupx-csv.js <schedule_id>
 *
 * Example:
 *   node scripts/import-groupx-csv.js a5af3ce8-9729-4073-b399-ee02e3268330
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('csv-parse/sync');

const CSV_PATH = path.resolve(process.cwd(), 'documents/GroupX_TM_MonSun_fixed.csv');

function fixTimeString(str) {
  if (!str) return null;
  let s = str.trim();
  s = s.replace(/10:15:11:00\s*am/i, '10:15-11:00am');
  s = s.replace(/10:15:11:00\s*AM/i, '10:15-11:00am');
  s = s.replace(/11:30-12:15\s*am/i, '11:30-12:15pm');
  s = s.replace(/11:30-12:15\s*AM/i, '11:30-12:15pm');
  s = s.replace(/\s+/g, '');
  return s;
}

function parseTimeRange(str) {
  if (!str) return null;
  const cleaned = fixTimeString(str);
  const m = cleaned.match(/^([^-\u2013\u2014]+)[-\u2013\u2014](.+)$/);
  if (!m) return null;
  const start = m[1];
  const end = m[2];
  return { start, end, original: str };
}

function to24h(t) {
  // simple hh:mm(am|pm) or h:mm(am|pm)
  const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) return null;
  let [_, hh, mm, ap] = m;
  let h = parseInt(hh, 10);
  if (ap.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (ap.toLowerCase() === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mm}:00`;
}

function splitInstructors(raw) {
  if (!raw) return [];
  return raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseName(raw) {
  if (!raw) return { first: null, last: null, nickname: null };
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null, nickname: null };
  const last = parts.pop();
  const first = parts.join(' ');
  return { first, last, nickname: null };
}

async function main() {
  const scheduleId = process.argv[2];
  if (!scheduleId) {
    console.error('Usage: node scripts/import-groupx-csv.js <schedule_id>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Upsert classes
  const classNameToId = new Map();
  for (const rec of records) {
    const name = rec.Class?.trim();
    if (!name || classNameToId.has(name)) continue;
    const { data, error } = await supabase
      .from('classes')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error) throw error;
    classNameToId.set(name, data.id);
  }

  // Upsert locations
  const locKeyToId = new Map();
  for (const rec of records) {
    const code = rec.LocationCode?.trim();
    const name = rec.LocationName?.trim();
    if (!code || !name) continue;
    const key = code;
    if (locKeyToId.has(key)) continue;
    const { data, error } = await supabase
      .from('locations')
      .upsert({ code, name }, { onConflict: 'code' })
      .select('id')
      .single();
    if (error) throw error;
    locKeyToId.set(key, data.id);
  }

  // Upsert instructors
  const instrNameToId = new Map();
  const upsertInstructor = async (raw) => {
    if (instrNameToId.has(raw)) return instrNameToId.get(raw);

    // First, try to find an existing instructor by raw_name (no unique constraint in DB)
    const { data: existing, error: existingErr } = await supabase
      .from('instructors')
      .select('id')
      .eq('raw_name', raw)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      instrNameToId.set(raw, existing.id);
      return existing.id;
    }

    const { first, last, nickname } = parseName(raw);
    const { data, error } = await supabase
      .from('instructors')
      .insert({ raw_name: raw, first_name: first, last_name: last, nickname })
      .select('id')
      .single();
    if (error) throw error;
    instrNameToId.set(raw, data.id);
    return data.id;
  };

  // Insert sessions and instructor links
  for (const rec of records) {
    const className = rec.Class?.trim();
    const locCode = rec.LocationCode?.trim();
    const day = rec.Day?.trim();
    const timeStr = rec.Time?.trim();
    const instrRaw = rec.Instructor?.trim();
    if (!className || !locCode || !day || !timeStr) continue;

    const class_id = classNameToId.get(className);
    const location_id = locKeyToId.get(locCode);
    if (!class_id || !location_id) continue;

    const t = parseTimeRange(timeStr);
    if (!t) {
      console.warn(`Could not parse time for row: ${timeStr}`);
      continue;
    }
    const start_time = to24h(t.start);
    const end_time = to24h(t.end);
    if (!start_time || !end_time) {
      console.warn(`Could not parse start/end for row: ${timeStr}`);
      continue;
    }

    const { data: session, error: sErr } = await supabase
      .from('class_sessions')
      .insert({
        schedule_id: scheduleId,
        class_id,
        location_id,
        day_of_week: day,
        start_time,
        end_time,
        original_time_text: timeStr,
      })
      .select('id')
      .single();
    if (sErr) throw sErr;

    // Instructors
    const names = splitInstructors(instrRaw);
    for (const n of names) {
      const iid = await upsertInstructor(n);
      const { error: siErr } = await supabase
        .from('session_instructors')
        .insert({ session_id: session.id, instructor_id: iid })
        .select('session_id')
        .single();
      if (siErr && siErr.code !== '23505') throw siErr; // ignore dup
    }
  }

  console.log('Import complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

