export function classNames(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDateAu(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
