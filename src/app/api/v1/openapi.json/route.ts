import { openApiDocument } from "../../../../product/openapi";

export const dynamic = "force-static";
export const GET = () => Response.json(openApiDocument());
