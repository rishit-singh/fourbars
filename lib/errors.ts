import { ZodError } from "zod";
export function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues
      .map((issue) => issue.message)
      .slice(0, 3)
      .join(". ");
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Something went wrong. Please try again.";
}
