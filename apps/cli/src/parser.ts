export function parseCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!parts) return null;

  const command = parts[0];
  const args = parts.slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"));

  return { command, args };
}
