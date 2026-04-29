#!/usr/bin/env node
/*
  Full PBF scanner for country-level OSM address import.

  This version intentionally DOES NOT create a prefiltered extract.
  It scans the whole .osm.pbf via `osmium cat -f opl`, parses raw OSM tags,
  and writes every object that contains at least one addr:* tag into public.osm_addresses.

  Required env:
    NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...

  Usage:
    npm run import:osm-addresses -- --country=HU
*/

import 'dotenv/config';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';

const COUNTRY_PBF_URLS = {
  HU: 'https://download.geofabrik.de/europe/hungary-latest.osm.pbf',
  AT: 'https://download.geofabrik.de/europe/austria-latest.osm.pbf',
  SK: 'https://download.geofabrik.de/europe/slovakia-latest.osm.pbf',
  RO: 'https://download.geofabrik.de/europe/romania-latest.osm.pbf',
  HR: 'https://download.geofabrik.de/europe/croatia-latest.osm.pbf',
  RS: 'https://download.geofabrik.de/europe/serbia-latest.osm.pbf',
  SI: 'https://download.geofabrik.de/europe/slovenia-latest.osm.pbf',
  CZ: 'https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf',
  UA: 'https://download.geofabrik.de/europe/ukraine-latest.osm.pbf',
  PL: 'https://download.geofabrik.de/europe/poland-latest.osm.pbf',
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : 'true';
  }
  return out;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required.`);
  return value.replace(/\/$/, '');
}

async function ensureCommand(command) {
  return new Promise((resolveOk, reject) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolveOk() : reject(new Error(`${command} is not available.`))));
  });
}

async function downloadFile(url, filePath) {
  console.log(`[download] ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(filePath));
  console.log(`[download] saved: ${filePath}`);
}

function unescapeOpl(value) {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\,/g, ',')
    .replace(/\\=/g, '=')
    .replace(/\\\\/g, '\\');
}

function splitUnescaped(input, sep) {
  const parts = [];
  let current = '';
  let escaped = false;
  for (const ch of input) {
    if (escaped) {
      current += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === sep) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseTags(rawTags) {
  const tags = {};
  if (!rawTags) return tags;
  for (const part of splitUnescaped(rawTags, ',')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = unescapeOpl(part.slice(0, eq));
    const value = unescapeOpl(part.slice(eq + 1));
    if (key) tags[key] = value;
  }
  return tags;
}

function parseOplLine(line) {
  if (!line || line.length < 2) return null;
  const prefix = line[0];
  const osmType = prefix === 'n' ? 'node' : prefix === 'w' ? 'way' : prefix === 'r' ? 'relation' : null;
  if (!osmType) return null;

  const firstSpace = line.indexOf(' ');
  const idPart = firstSpace === -1 ? line.slice(1) : line.slice(1, firstSpace);
  const osmId = Number(idPart);
  if (!Number.isFinite(osmId)) return null;

  const tokens = firstSpace === -1 ? [] : line.slice(firstSpace + 1).split(' ');
  let lon = null;
  let lat = null;
  let rawTags = '';

  for (const token of tokens) {
    if (token.startsWith('x')) lon = Number(token.slice(1));
    else if (token.startsWith('y')) lat = Number(token.slice(1));
    else if (token.startsWith('T')) rawTags = token.slice(1);
  }

  return { osm_id: osmId, osm_type: osmType, lon: Number.isFinite(lon) ? lon : null, lat: Number.isFinite(lat) ? lat : null, tags: parseTags(rawTags) };
}

function splitStreet(street) {
  const value = String(street ?? '').trim();
  if (!value) return { street_name: null, street_type: null, street_type_normalized: null };
  const types = [
    'út', 'utca', 'u.', 'tér', 'tere', 'körút', 'krt.', 'sugárút', 'sétány', 'köz', 'dűlő', 'dülő',
    'sor', 'rakpart', 'fasor', 'lépcső', 'lejtő', 'park', 'liget', 'udvar', 'telep', 'major', 'útja', 'határút'
  ];
  const parts = value.split(/\s+/);
  const lastTwo = parts.slice(-2).join(' ').toLowerCase();
  const last = parts.at(-1)?.toLowerCase();
  const matched = types.find((t) => t === lastTwo) ?? types.find((t) => t === last);
  if (!matched) return { street_name: value, street_type: null, street_type_normalized: null };
  const count = matched.includes(' ') ? 2 : 1;
  return {
    street_name: parts.slice(0, -count).join(' ') || value,
    street_type: parts.slice(-count).join(' '),
    street_type_normalized: matched.replace('u.', 'utca').replace('krt.', 'körút'),
  };
}

function splitHouseNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { house_number: null, house_number_suffix: null };
  const match = raw.match(/^(\d+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\/-]*)(?:\s*(.*))?$/);
  return { house_number: match?.[1] ?? raw, house_number_suffix: match?.[2] || null };
}

function displayName(tags, countryCode) {
  return [
    tags['addr:country'] ?? countryCode,
    tags['addr:postcode'],
    tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? tags['addr:municipality'],
    tags['addr:street'] ?? tags['addr:place'],
    tags['addr:housenumber'],
    tags['addr:floor'] ? `${tags['addr:floor']}. emelet` : null,
    tags['addr:door'] ? `${tags['addr:door']}. ajtó` : null,
  ].filter(Boolean).join(', ');
}

function mapOsmToRow(osm, countryCode, sourceFile, importSessionId) {
  const tags = osm.tags ?? {};
  const hasAddressTag = Object.keys(tags).some((key) => key.startsWith('addr:'));
  if (!hasAddressTag) return null;

  const street = tags['addr:street'] ?? tags['addr:place'] ?? null;
  const streetParts = splitStreet(street);
  const houseParts = splitHouseNumber(tags['addr:housenumber']);
  const externalId = `${osm.osm_type}/${osm.osm_id}`;

  return {
    external_id: externalId,
    osm_id: osm.osm_id,
    osm_type: osm.osm_type,
    display_name: displayName(tags, countryCode) || tags.name || externalId,
    name: tags.name ?? null,
    country: tags['addr:country'] ?? null,
    country_code: String(tags['addr:country'] ?? countryCode).toUpperCase(),
    state: tags['addr:state'] ?? null,
    county: tags['addr:county'] ?? null,
    district: tags['addr:district'] ?? null,
    municipality: tags['addr:municipality'] ?? null,
    city: tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? null,
    town: tags['addr:town'] ?? null,
    village: tags['addr:village'] ?? null,
    suburb: tags['addr:suburb'] ?? null,
    neighbourhood: tags['addr:neighbourhood'] ?? null,
    hamlet: tags['addr:hamlet'] ?? null,
    postcode: tags['addr:postcode'] ?? null,
    street,
    ...streetParts,
    place: tags['addr:place'] ?? null,
    housenumber: tags['addr:housenumber'] ?? null,
    ...houseParts,
    unit: tags['addr:unit'] ?? null,
    floor: tags['addr:floor'] ?? null,
    door: tags['addr:door'] ?? null,
    staircase: tags['addr:staircase'] ?? null,
    entrance: tags['addr:entrance'] ?? null,
    block: tags['addr:block'] ?? null,
    building: tags['addr:building'] ?? tags.building ?? null,
    flats: tags['addr:flats'] ?? null,
    conscriptionnumber: tags['addr:conscriptionnumber'] ?? null,
    interpolation: tags['addr:interpolation'] ?? null,
    lat: osm.lat,
    lon: osm.lon,
    geometry_type: osm.osm_type === 'node' ? 'Point' : null,
    raw_tags: tags,
    raw_feature: osm,
    source_file: sourceFile,
    import_session_id: importSessionId,
  };
}

async function upsertRows({ supabaseUrl, serviceKey, rows }) {
  if (!rows.length) return 0;
  const res = await fetch(`${supabaseUrl}/rest/v1/osm_addresses?on_conflict=external_id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed: HTTP ${res.status} ${text.slice(0, 1000)}`);
  }
  return rows.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const countryCode = String(args.country ?? process.env.OSM_COUNTRY_CODE ?? 'HU').toUpperCase();
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const batchSize = Math.max(100, Number(args.batch ?? process.env.OSM_IMPORT_BATCH_SIZE ?? '500'));
  const dataDir = resolve(String(args.dataDir ?? process.env.OSM_DATA_DIR ?? './data/osm'));
  mkdirSync(dataDir, { recursive: true });

  await ensureCommand('osmium');

  const url = String(args.url ?? process.env.OSM_PBF_URL ?? COUNTRY_PBF_URLS[countryCode] ?? '');
  const pbfPath = args.pbf ? resolve(String(args.pbf)) : url ? join(dataDir, basename(new URL(url).pathname)) : '';
  if (!pbfPath) throw new Error(`No Geofabrik URL configured for country ${countryCode}. Pass --url=... or --pbf=...`);
  if (!existsSync(pbfPath)) await downloadFile(url, pbfPath);

  const importSessionId = randomUUID();
  console.log(`[import] country=${countryCode} file=${pbfPath} batch=${batchSize} session=${importSessionId} mode=full-pbf-opl-no-prefilter`);

  const child = spawn('osmium', ['cat', pbfPath, '-f', 'opl'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let scanned = 0;
  let mapped = 0;
  let written = 0;
  let rows = [];

  for await (const line of rl) {
    const clean = line.trim();
    if (!clean) continue;
    scanned += 1;
    const osm = parseOplLine(clean);
    if (!osm) continue;
    const row = mapOsmToRow(osm, countryCode, pbfPath, importSessionId);
    if (!row) continue;
    mapped += 1;
    rows.push(row);
    if (rows.length >= batchSize) {
      written += await upsertRows({ supabaseUrl, serviceKey, rows });
      console.log(`[import] scanned=${scanned.toLocaleString()} mapped=${mapped.toLocaleString()} written=${written.toLocaleString()}`);
      rows = [];
    }
  }

  if (rows.length) written += await upsertRows({ supabaseUrl, serviceKey, rows });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  if (exitCode !== 0) throw new Error(`osmium exited with code ${exitCode}`);
  console.log(`[done] scanned=${scanned.toLocaleString()} mapped=${mapped.toLocaleString()} written=${written.toLocaleString()} session=${importSessionId}`);
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
