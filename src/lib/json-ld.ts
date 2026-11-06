const BACKSLASH = String.fromCharCode(92);

/**
 * JSON for an inline <script type="application/ld+json"> block. `<`, `>` and `&` are written as JSON
 * unicode escapes so admin-editable text (e.g. "</script>") can never close the script element.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/[<>&]/g, (char) => `${BACKSLASH}u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
