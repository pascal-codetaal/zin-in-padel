/** Contact Picker API (Chrome Android, limited support). */
interface ContactPickerResult {
  name?: string[];
  tel?: string[];
  email?: string[];
}

interface ContactsManager {
  select(
    properties: ("name" | "tel" | "email")[],
    options?: { multiple?: boolean },
  ): Promise<ContactPickerResult[]>;
}

interface Navigator {
  readonly contacts?: ContactsManager;
}
