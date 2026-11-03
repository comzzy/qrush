import { HTTPException } from "hono/http-exception";

export const badRequest = (message: string) => new HTTPException(400, { message });
export const unauthorized = (message = "Unauthorized") => new HTTPException(401, { message });
export const forbidden = (message = "Forbidden") => new HTTPException(403, { message });
export const notFound = (message = "Not found") => new HTTPException(404, { message });
export const conflict = (message: string) => new HTTPException(409, { message });
export const unavailable = (message: string) => new HTTPException(503, { message });
