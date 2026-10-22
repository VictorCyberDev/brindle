import type { ZetarisResponseShape } from "./response-shape";

export class ZetarisRequestError extends Error {
  override name = "ZetarisRequestError";
  constructor(
    message: string,
    public readonly httpStatus: number | null,
    public readonly requestId: string,
  ) {
    super(message);
  }
}

/**
 * The endpoint answered, but with a row family Brindle cannot normalize
 * without guessing (e.g. positional rows with no documented column
 * metadata). Carries ONLY secret-free shape facts: no row values, no body.
 */
export class ZetarisResponseShapeUnsupportedError extends ZetarisRequestError {
  override name = "ZetarisResponseShapeUnsupportedError";
  constructor(
    public readonly shape: ZetarisResponseShape,
    httpStatus: number,
    requestId: string,
  ) {
    super(
      `Zetaris response family ${shape.family} (rows=${shape.rowCount ?? "n/a"}, width=${shape.firstRowWidth ?? "n/a"}) ` +
        `cannot be normalized: no documented column metadata is available to map positional rows to columns`,
      httpStatus,
      requestId,
    );
  }
}
