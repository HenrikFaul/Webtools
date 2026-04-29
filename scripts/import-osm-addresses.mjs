#!/usr/bin/env node
/*
  Import full-country address records from a Geofabrik/OpenStreetMap .osm.pbf file into Supabase.

  Requirements:
    - Node.js 18+
    - osmium-tool installed in the environment: https://osmcode.org/osmium-tool/
    - Supabase migration 20260429190000_osm_addresses_table.sql applied

  Examples:
    npm run import:osm-addresses -- --country=HU
    npm run import:osm-addresses -- --country=AT --pbf=/workspaces/data/austria-latest.osm.pbf
    npm run import:osm-addresses -- --country=HU --url=https://download.geofabrik.de/europe/hungary-latest.osm.pbf

  Env vars:
    NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...
*/

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";

const COUNTRY_PBF_URLS = {
  HU: "https://download.geofabrik.de/europe/hungary-latest.osm.pbf",
  AT: "https://download.geofabrik.de/europe/austria-latest.osm.pbf",
  SK: "https://download.geofabrik.de/europe/slovakia-latest.osm.pbf",
  RO: "https://download.geofabrik.de/europe/romania-latest.osm.pbf",
  HR: "https://download.geofabrik.de/europe/croatia-latest.osm.pbf",
  RS: "https://download.geofabrik.de/europe/serbia-latest.osm.pbf",
  SI: "https://download.geofabrik.de/europe/slovenia-latest.osm.pbf",
  CZ: "https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf",
  UA: "https://download.geofabrik.de/europe/ukraine-latest.osm.pbf",
  PL: "https://download.geofabrik.de/europe/poland-latest.osm.pbf",
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    out[key] = rest.length ? rest.join("=") : "true";
  }
  return out;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required.`);
  return value.replace(/\/$/, "");
}

async function ensureCommand(command) {
  return new Promise((resolveOk, reject) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveOk() : reject(new Error(`${command} is not available.`)));
  });
}

async function downloadFile(url, filePath) {
  console.log(`[download] ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(filePath));
  console.log(`[download] saved: ${filePath}`);
}

function getTags(feature) {
  // osmium export can emit tags either directly in properties or nested depending on version/options.
  const props = feature?.properties ?? {};
  return props.tags && typeof props.tags === "object" ? props.tags : props;
}

function parseOsmIdentity(feature) {
  const idRaw = feature?.id ?? feature?.properties?.id ?? feature?.properties?.['@id'] ?? feature?.properties?.osm_id;
  const typeRaw = feature?.properties?.type ?? feature?.properties?.osm_type ?? feature?.properties?.['@type'];
  if (typeof idRaw === "string" && idRaw.includes("/")) {
    const [type, id] = idRaw.split("/");
    return { osm_type: normalizeType(type), osm_id: Number(id) };
  }
  if (typeof idRaw === "string" && /^[nwr]\d+$/.test(idRaw)) {
    const prefix = idRaw[0];
    return { osm_type: prefix === "n" ? "node" : prefix === "w" ? "way" : "relation", osm_id: Number(idRaw.slice(1)) };
  }
  return { osm_type: normalizeType(typeRaw), osm_id: Number(idRaw) };
}

function normalizeType(value) {
  const v = String(value ?? "").toLowerCase();
  if (v === "n" || v === "node") return "node";
  if (v === "w" || v === "way") return "way";
  if (v === "r" || v === "relation") return "relation";
  return "node";
}

function centroidFromGeometry(geometry) {
  if (!geometry) return { lat: null, lon: null, geometry_type: null };
  const coords = [];
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") coords.push(value);
    else for (const item of value) walk(item);
  };
  walk(geometry.coordinates);
  if (!coords.length) return { lat: null, lon: null, geometry_type: geometry.type ?? null };
  const lon = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  return { lat, lon, geometry_type: geometry.type ?? null };
}

function splitStreet(street) {
  const value = String(street ?? "").trim();
  if (!value) return { street_name: null, street_type: null, street_type_normalized: null };
  const HungarianStreetTypes = [
    "út", "utca", "u.", "tér", "tere", "körút", "krt.", "sugárút", "sétány", "köz", "dűlő", "dülő",
    "sor", "rakpart", "fasor", "lépcső", "lejtő", "park", "liget", "udvar", "telep", "major",
    "útja", "határút", "alsó", "felső"
  ];
  const parts = value.split(/\s+/);
  const lastTwo = parts.slice(-2).join(" ").toLowerCase();
  const last = parts.at(-1)?.toLowerCase();
  const matched = HungarianStreetTypes.find((t) => t === lastTwo) ?? HungarianStreetTypes.find((t) => t === last);
  if (!matched) return { street_name: value, street_type: null, street_type_normalized: null };
  const typeWordCount = matched.includes(" ") ? 2 : 1;
  return {
    street_name: parts.slice(0, -typeWordCount).join(" ") || value,
    street_type: parts.slice(-typeWordCount).join(" "),
    street_type_normalized: matched.replace("u.", "utca").replace("krt.", "körút"),
  };
}

function splitHouseNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { house_number: null, house_number_suffix: null };
  const match = raw.match(/^(\d+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\/-]*)(?:\s*(.*))?$/);
  return { house_number: match?.[1] ?? raw, house_number_suffix: match?.[2] || null };
}

function displayName(tags) {
  return [
    tags["addr:country"],
    tags["addr:postcode"],
    tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"] ?? tags["addr:municipality"],
    tags["addr:street"] ?? tags["addr:place"],
    tags["addr:housenumber"],
    tags["addr:floor"] ? `${tags["addr:floor"]}. emelet` : null,
    tags["addr:door"] ? `${tags["addr:door"]}. ajtó` : null,
  ].filter(Boolean).join(", ");
}

function mapFeatureToRow(feature, countryCode, sourceFile, importSessionId) {
  const tags = getTags(feature);
  const { osm_type, osm_id } = parseOsmIdentity(feature);
  if (!Number.isFinite(osm_id)) return null;

  const street = tags["addr:street"] ?? tags["addr:place"] ?? null;
  const streetParts = splitStreet(street);
  const houseParts = splitHouseNumber(tags["addr:housenumber"]);
  const point = centroidFromGeometry(feature.geometry);

  const row = {
    osm_id,
    osm_type,
    display_name: displayName(tags) || tags.name || null,
    name: tags.name ?? null,
    country: tags["addr:country"] ?? null,
    country_code: String(tags["addr:country"] ?? countryCode).toUpperCase(),
    state: tags["addr:state"] ?? null,
    county: tags["addr:county"] ?? null,
    district: tags["addr:district"] ?? null,
    municipality: tags["addr:municipality"] ?? null,
    city: tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"] ?? null,
    town: tags["addr:town"] ?? null,
    village: tags["addr:village"] ?? null,
    suburb: tags["addr:suburb"] ?? null,
    neighbourhood: tags["addr:neighbourhood"] ?? null,
    hamlet: tags["addr:hamlet"] ?? null,
    postcode: tags["addr:postcode"] ?? null,
    street,
    ...streetParts,
    place: tags["addr:place"] ?? null,
    housenumber: tags["addr:housenumber"] ?? null,
    ...houseParts,
    unit: tags["addr:unit"] ?? null,
    floor: tags["addr:floor"] ?? null,
    door: tags["addr:door"] ?? null,
    staircase: tags["addr:staircase"] ?? null,
    entrance: tags["addr:entrance"] ?? null,
    block: tags["addr:block"] ?? null,
    building: tags["addr:building"] ?? tags.building ?? null,
    flats: tags["addr:flats"] ?? null,
    conscriptionnumber: tags["addr:conscriptionnumber"] ?? null,
    interpolation: tags["addr:interpolation"] ?? null,
    lat: point.lat,
    lon: point.lon,
    geometry_type: point.geometry_type,
    raw_tags: tags,
    raw_feature: feature,
    source_file: sourceFile,
    import_session_id: importSessionId,
  };

  // Keep only actual address objects. Do not import generic POI without addr:* detail.
  if (!row.housenumber && !row.street && !row.postcode && !row.city && !row.door && !row.floor) return null;
  return row;
}

async function upsertRows({ supabaseUrl, serviceKey, rows }) {
  if (!rows.length) return 0;
  const res = await fetch(`${supabaseUrl}/rest/v1/osm_addresses?on_conflict=external_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return rows.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const countryCode = String(args.country ?? process.env.OSM_COUNTRY_CODE ?? "HU").toUpperCase();
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const batchSize = Math.max(100, Number(args.batch ?? process.env.OSM_IMPORT_BATCH_SIZE ?? "500"));
  const dataDir = resolve(String(args.dataDir ?? process.env.OSM_DATA_DIR ?? "./data/osm"));
  mkdirSync(dataDir, { recursive: true });

  await ensureCommand("osmium");

  const url = String(args.url ?? process.env.OSM_PBF_URL ?? COUNTRY_PBF_URLS[countryCode] ?? "");
  const pbfPath = args.pbf ? resolve(String(args.pbf)) : url ? join(dataDir, basename(new URL(url).pathname)) : "";
  if (!pbfPath) throw new Error(`No Geofabrik URL configured for country ${countryCode}. Pass --url=... or --pbf=...`);
  if (!existsSync(pbfPath)) await downloadFile(url, pbfPath);

  const importSessionId = randomUUID();
  console.log(`[import] country=${countryCode} file=${pbfPath} batch=${batchSize} session=${importSessionId}`);

  const osmiumArgs = [
    "export",
    pbfPath,
    "-f", "geojsonseq",
    "--geometry-types=point,linestring,polygon",
    "-o", "-",
  ];
  const child = spawn("osmium", osmiumArgs, { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let scanned = 0;
  let mapped = 0;
  let written = 0;
  let rows = [];

  for await (const line of rl) {
    const clean = line.replace(/^\x1e/, "").trim();
    if (!clean) continue;
    scanned += 1;
    let feature;
    try { feature = JSON.parse(clean); } catch { continue; }
    const row = mapFeatureToRow(feature, countryCode, pbfPath, importSessionId);
    if (!row) continue;
    if (row.country_code !== countryCode && row.country_code !== String(countryCode).toUpperCase()) row.country_code = countryCode;
    mapped += 1;
    rows.push(row);
    if (rows.length >= batchSize) {
      written += await upsertRows({ supabaseUrl, serviceKey, rows });
      console.log(`[import] scanned=${scanned.toLocaleString()} mapped=${mapped.toLocaleString()} written=${written.toLocaleString()}`);
      rows = [];
    }
  }

  if (rows.length) {
    written += await upsertRows({ supabaseUrl, serviceKey, rows });
  }

  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(`osmium exited with code ${exitCode}`);
  console.log(`[done] scanned=${scanned.toLocaleString()} mapped=${mapped.toLocaleString()} written=${written.toLocaleString()} session=${importSessionId}`);
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
