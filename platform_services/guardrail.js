import { forbiddenTermSignals, anonymize, maskKnownPlacesForForbidden } from "./incidents_features";
import { getRuntimeConfig } from "./runtime_config";

export async function validateDescriptionGuard(text) {
  const cfg = await getRuntimeConfig();
  const masked = maskKnownPlacesForForbidden(text, cfg.knownPlaces);
  const forb = forbiddenTermSignals(masked, cfg.forbiddenAliases);
  if (forb.hasForbidden) {
    return {
      ok: false,
      code: "PRIVACY_BLOCKED",
      suggestedDescription: anonymize(text),
    };
  }
  return { ok: true };
}
