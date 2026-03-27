export type AppLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const LOG_LEVEL_ORDER: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(configuredLevel: string, requestedLevel: string): boolean {
  const configured = LOG_LEVEL_ORDER[configuredLevel] ?? LOG_LEVEL_ORDER.info;
  const requested = LOG_LEVEL_ORDER[requestedLevel] ?? LOG_LEVEL_ORDER.info;
  return requested <= configured;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export function createLogger(level: string): AppLogger {
  const write = (
    targetLevel: "debug" | "info" | "warn" | "error",
    args: unknown[],
  ) => {
    if (!shouldLog(level, targetLevel)) {
      return;
    }

    const line = `${targetLevel.toUpperCase()} ${formatArgs(args)}`;
    if (targetLevel === "error") {
      console.error(line);
      return;
    }

    if (targetLevel === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  };

  return {
    debug: (...args: unknown[]) => write("debug", args),
    info: (...args: unknown[]) => write("info", args),
    warn: (...args: unknown[]) => write("warn", args),
    error: (...args: unknown[]) => write("error", args),
  };
}
