"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Only same-site paths are honoured after sign-in, so ?next= cannot become an open redirect. */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  return next;
}
