export function humanizeUnderscoreLabel(value: unknown) {
  if (value == null) return "";
  return String(value).split("_").join(" ");
}
