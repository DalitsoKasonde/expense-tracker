import { NextResponse } from "next/server";

// Liveness/readiness probe for the container healthcheck, Traefik's load
// balancer healthcheck and the deploy pipeline's post-deploy verification.
// APP_VERSION is set to the deployed git commit SHA, so callers can assert
// that the build they shipped is the build that is actually serving traffic.
// Traefik routes /api/* to the API service, so this must stay off /api.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    version: process.env.APP_VERSION ?? "dev",
  });
}
