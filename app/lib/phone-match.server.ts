/** Digits-only form for comparing BE/NL numbers across formats. */
export function phoneDigitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** Last 9 digits — typical BE mobile length without country code. */
function phoneTail(digits: string): string {
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function phonesEquivalent(a: string, b: string): boolean {
  const da = phoneDigitsOnly(a);
  const db = phoneDigitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return phoneTail(da) === phoneTail(db);
}
