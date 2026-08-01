/** Turns raw Postgres / PostgREST errors into messages a user can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string; details?: string } | null;
  const raw = (e?.message ?? "").toString();
  const msg = raw.toLowerCase();
  const code = e?.code ?? "";

  const NO_PERMISSION =
    "You don't have permission to do this — ask an administrator to grant you access.";

  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("permission denied") ||
    msg.includes("not authorised") ||
    msg.includes("not authorized") ||
    msg.includes("only administrators")
  ) {
    return NO_PERMISSION;
  }

  if (msg.includes("not authenticated") || msg.includes("jwt")) {
    return "Your session has expired. Please sign in again.";
  }

  if (code === "23505" || msg.includes("duplicate key")) {
    if (msg.includes("invoice_number")) return "An invoice with that number already exists.";
    if (msg.includes("customer_code")) return "A customer with that code already exists.";
    return "That record already exists.";
  }

  if (code === "23503" || msg.includes("foreign key")) {
    return "This record is linked to other data and can't be removed. Set it to Archived instead.";
  }

  if (code === "23502" || msg.includes("null value in column")) {
    return "Some required fields are missing. Please fill in every field marked with *.";
  }

  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Network problem — check your connection and try again.";
  }

  return raw || "Something went wrong. Please try again.";
}
