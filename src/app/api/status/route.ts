import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/llm";
import { CONFIG } from "@/lib/config";
import { runtimeStatuses } from "@/lib/exec/runner";

// Lightweight health/status endpoint: what question provider is active, whether
// an OpenAI key is configured, which code runtimes are installed, and app
// tunables. Useful for the UI and as a deployment health check.
//
// Dynamic on purpose: runtime detection must reflect the runtime that answers
// requests, not the build machine (which may have different toolchains).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      ...providerStatus(),
      codepad: {
        enabled: CONFIG.codeExecutionEnabled,
        timeoutMs: CONFIG.runTimeoutMs,
        runtimes: await runtimeStatuses(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: null,
        error: error instanceof Error ? error.message : "Unknown provider error",
      },
      { status: 500 },
    );
  }
}
