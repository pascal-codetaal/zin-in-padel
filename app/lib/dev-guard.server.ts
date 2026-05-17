export function assertDevOnly(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Response(null, { status: 404 });
  }
}
