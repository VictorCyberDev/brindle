/** Raised when an adapter is used without being configured/implemented. Never silently faked. */
export class IntegrationNotAvailableError extends Error {
  override name = "IntegrationNotAvailableError";
  constructor(
    public readonly integration: "zetaris" | "meterless" | "nemotron",
    operation: string,
    reason: string,
  ) {
    super(`${integration}.${operation} is not available: ${reason}`);
  }
}
