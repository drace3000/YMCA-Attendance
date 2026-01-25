#!/usr/bin/env node

/**
 * Export branches table to CSV file.
 * 
 * Exports all rows with columns: Name, Address, City, State, Zip, phone, description
 * 
 * Prereqs:
 * - Supabase service role key in env SUPABASE_SERVICE_ROLE_KEY
 * - Supabase project URL in env SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
 * 
 * Usage:
 *   node scripts/export-branches-csv.js
 * 
 * Output:
 *   documents/branches-export.csv
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const env = { ...process.env };
  try {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  } catch (_) {
    // ignore missing .env
  }
  return env;
}

function escapeCsvField(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCsv(data) {
  if (!data || data.length === 0) return '';
  
  // CSV header
  const headers = ['Name', 'Address', 'City', 'State', 'Zip', 'phone', 'description'];
  const headerRow = headers.join(',');
  
  // CSV rows
  const rows = data.map((branch) => {
    return [
      escapeCsvField(branch.name),
      escapeCsvField(branch.address),
      escapeCsvField(branch.city),
      escapeCsvField(branch.state),
      escapeCsvField(branch.zip),
      escapeCsvField(branch.phone),
      escapeCsvField(branch.description),
    ].join(',');
  });
  
  return [headerRow, ...rows].join('\n');
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || 'https://pgsqtbblahihqesnvwxd.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!key) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment');
    console.error('Set it in .env file or environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(url, key);
  
  console.log('Fetching branches from Supabase...');
  const { data, error } = await supabase
    .from('branches')
    .select('name, address, city, state, zip, phone, description')
    .order('name');
  
  if (error) {
    console.error('Error fetching branches:', error);
    process.exit(1);
  }
  
  if (!data || data.length === 0) {
    console.log('No branches found.');
    process.exit(0);
  }
  
  console.log(`Found ${data.length} branches`);
  
  const csv = arrayToCsv(data);
  const outputPath = path.resolve(process.cwd(), 'documents/branches-export.csv');
  
  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(`✅ Exported ${data.length} branches to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


