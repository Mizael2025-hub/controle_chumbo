/**
 * Geração de UUID v4 com fallback.
 *
 * Motivo: no iOS (especialmente em `http://IP:3000`), `crypto.randomUUID()`
 * pode não existir (não-secure context ou iOS antigo). `crypto.getRandomValues()`
 * costuma existir mesmo em contexto inseguro.
 */
export function uuidV4(): string {
  const c = globalThis.crypto as Crypto | undefined;
  // Alguns ambientes exigem que randomUUID seja chamado com o "this" correto (crypto).
  if (c && typeof (c as Crypto & { randomUUID?: () => string }).randomUUID === "function") {
    return (c as Crypto & { randomUUID: () => string }).randomUUID();
  }

  // RFC 4122 v4 via getRandomValues
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // Set version (4) and variant (10)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Último fallback (não criptográfico, mas evita quebra total).
  const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${rnd().slice(0, 8)}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-a${rnd().slice(0, 3)}-${rnd()}${rnd().slice(0, 4)}`;
}

