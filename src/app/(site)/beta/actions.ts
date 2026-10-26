"use server";

import { headers } from "next/headers";
import { getConfig } from "../../../config/env";
import { guarded, type ActionResult } from "../../../server/actions-core";
import { BetaRequestRejected, submitBetaRequest } from "../../../server/beta";
import { getProductDb } from "../../../server/db";

export async function betaRequestAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
    const cfg = getConfig();
    const salt = cfg.auth.status === "configured" ? cfg.auth.ipSalt : "dev-salt";
    const raw = {
      email: String(form.get("email") ?? ""),
      company: String(form.get("company") ?? ""),
      role: String(form.get("role") ?? ""),
      useCase: String(form.get("useCase") ?? ""),
      website: String(form.get("website") ?? ""),
    };
    try {
      const { db } = await getProductDb();
      await submitBetaRequest(db, raw, ip, salt);
    } catch (e) {
      if (e instanceof BetaRequestRejected) {
        // The honeypot is answered as a success so bots learn nothing.
        if (raw.website) return { ok: true, message: "Thanks. We will be in touch." };
        return { ok: false, message: e.message };
      }
      throw e;
    }
    return { ok: true, message: "Thanks. We read every request and will be in touch." };
  });
}
