/**
 * Protected Cron Endpoint: /api/cron/reminders
 *
 * Rules:
 * Rule #1: No AI inside the app.
 * Rule #4: All operations respect multi-tenancy & financial audit safety.
 *
 * Called daily by Vercel Cron or on-demand by monitoring services.
 * Requires Authorization: Bearer <CRON_SECRET> or header x-cron-secret: <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from "next/server";
import { processDueReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not configured yet, allow in non-production for local testing,
    // but in production require CRON_SECRET to be configured.
    if (process.env.NODE_ENV === "production") {
      console.error("[Cron Auth] CRON_SECRET environment variable is missing on production.");
      return false;
    }
    return true;
  }

  const authHeader = req.headers.get("authorization");
  const xCronSecret = req.headers.get("x-cron-secret");

  const isBearerValid = authHeader === `Bearer ${cronSecret}`;
  const isHeaderValid = xCronSecret === cronSecret;

  return isBearerValid || isHeaderValid;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing CRON_SECRET" },
      { status: 401 }
    );
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error("[Cron Reminders Error]", err);
    return NextResponse.json(
      { error: "Internal server error processing reminders", message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
