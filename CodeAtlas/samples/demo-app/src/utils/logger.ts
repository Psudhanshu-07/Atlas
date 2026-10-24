type Level = "debug" | "info" | "error";

const buffer: string[] = [];

function write(level: Level, message: string, ...rest: unknown[]): void {
  buffer.push(level + " " + message + " " + rest.join(" "));
  if (buffer.length > 500) buffer.shift();
}

export const logger = {
  debug: (message: string, ...rest: unknown[]) => write("debug", message, ...rest),
  info: (message: string, ...rest: unknown[]) => write("info", message, ...rest),
  error: (message: string, ...rest: unknown[]) => write("error", message, ...rest),
  drain: () => buffer.splice(0, buffer.length),
};
