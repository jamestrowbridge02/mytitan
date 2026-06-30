import { decryptText, encryptText } from '../integrations/integrations.crypto';

export function encryptPlatformSecret(secret: string) {
  return encryptText(secret);
}

export function decryptPlatformSecret(value?: string | null) {
  if (!value) return null;
  return String(decryptText(value) || '').trim() || null;
}

export function encryptedPlatformSecretDecryptable(value?: string | null) {
  if (!value) return false;
  try {
    return Boolean(decryptPlatformSecret(value));
  } catch {
    return false;
  }
}

export function buildPlatformPersistenceState(input: {
  row: any;
  encryptedFields: string[];
  touchedFields: string[];
  runtimeLoaded: boolean;
}) {
  const rowExists = Boolean(input.row);
  const touchedFieldsPersisted = input.touchedFields.every((field) => Boolean(input.row?.[field]));
  const encryptedFieldsDecryptable = input.encryptedFields
    .filter((field) => Boolean(input.row?.[field]))
    .every((field) => encryptedPlatformSecretDecryptable(input.row?.[field]));
  const persisted = rowExists && touchedFieldsPersisted && encryptedFieldsDecryptable;
  return {
    persisted,
    saved: persisted,
    runtimeLoaded: Boolean(input.runtimeLoaded),
  };
}
