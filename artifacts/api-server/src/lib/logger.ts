type LogMethod = (...args: unknown[]) => void;

const logger = {
  level: process.env.LOG_LEVEL || "info",

  info: ((...args: unknown[]) => {
    console.log(...args);
  }) as LogMethod,

  error: ((...args: unknown[]) => {
    console.error(...args);
  }) as LogMethod,

  warn: ((...args: unknown[]) => {
    console.warn(...args);
  }) as LogMethod,

  debug: ((...args: unknown[]) => {
    console.debug(...args);
  }) as LogMethod,

  trace: ((...args: unknown[]) => {
    console.trace(...args);
  }) as LogMethod,

  fatal: ((...args: unknown[]) => {
    console.error(...args);
  }) as LogMethod,

  child: (_bindings?: Record<string, unknown>) => logger,
};

export { logger };
export default logger;