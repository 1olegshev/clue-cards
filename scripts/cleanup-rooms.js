#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Delete stale rooms from Realtime Database.
 * 
 * Deletes rooms that are:
 * 1. Older than X hours (default 24h), OR
 * 2. Have all players disconnected (connected: false)
 * 
 * Usage:
 *   npm run cleanup:rooms                    # delete stale rooms (24h cutoff)
 *   npm run cleanup:rooms -- --hours 4       # delete rooms older than 4h
 *   npm run cleanup:rooms -- --dry-run       # preview only
 *   npm run cleanup:rooms -- --disconnected  # only delete rooms where all players disconnected
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

function readDefaultProjectId() {
  try {
    const firebasercPath = path.join(process.cwd(), ".firebaserc");
    const raw = fs.readFileSync(firebasercPath, "utf8");
    const data = JSON.parse(raw);
    return data?.projects?.default || null;
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { hours: 24, dryRun: false, disconnectedOnly: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--hours" && args[i + 1]) {
      result.hours = Number(args[i + 1]);
      i += 1;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--disconnected") {
      result.disconnectedOnly = true;
    }
  }
  return result;
}

function allPlayersDisconnected(roomData, staleMinutes = 5) {
  const players = roomData.players;
  if (!players || Object.keys(players).length === 0) return true;
  
  const staleThreshold = Date.now() - staleMinutes * 60 * 1000;
  
  return Object.values(players).every((p) => {
    // Explicit disconnection
    if (p.connected !== true) return true;
    // Connected but lastSeen is stale (zombie player from race condition)
    if (p.lastSeen && p.lastSeen < staleThreshold) return true;
    // Actually connected
    return false;
  });
}

async function main() {
  const { hours, dryRun, disconnectedOnly } = parseArgs();
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("Invalid --hours value. Example: --hours 24");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || readDefaultProjectId();
  if (!projectId) {
    console.error("No Firebase project id found. Set FIREBASE_PROJECT_ID or update .firebaserc.");
    process.exit(1);
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL || 
    `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;

  initializeApp({ credential: applicationDefault(), projectId, databaseURL });
  const db = getDatabase();

  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const roomsSnap = await db.ref("rooms").once("value");
  const rooms = roomsSnap.val() || {};

  let deleted = 0;
  let kept = 0;

  for (const [roomId, roomData] of Object.entries(rooms)) {
    const createdAt = roomData.createdAt;
    const allDisconnected = allPlayersDisconnected(roomData);
    const tooOld = createdAt && createdAt < cutoffMs;
    const noCreatedAt = !createdAt;

    // Determine if should delete
    let shouldDelete = false;
    let reason = "";

    if (disconnectedOnly) {
      // Only delete if all players disconnected
      if (allDisconnected) {
        shouldDelete = true;
        reason = "all players disconnected";
      }
    } else {
      // Delete if: no createdAt, too old, OR all disconnected
      if (noCreatedAt) {
        shouldDelete = true;
        reason = "no createdAt";
      } else if (allDisconnected) {
        shouldDelete = true;
        reason = "all players disconnected";
      } else if (tooOld) {
        shouldDelete = true;
        reason = `older than ${hours}h`;
      }
    }

    if (shouldDelete) {
      if (!dryRun) await db.ref(`rooms/${roomId}`).remove();
      deleted += 1;
      console.log(`[delete] ${roomId} (${reason})`);
    } else {
      kept += 1;
      const age = createdAt ? `${Math.round((Date.now() - createdAt) / 60000)}m old` : "unknown age";
      const status = allDisconnected ? "all disconnected" : "has connected players";
      console.log(`[keep] ${roomId} (${age}, ${status})`);
    }
  }

  console.log(`\nRooms scanned: ${Object.keys(rooms).length}`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Kept: ${kept}`);
  if (dryRun) console.log("(dry run - no actual deletes)");
}

main().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
