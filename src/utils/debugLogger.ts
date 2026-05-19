/**
 * Logger condicional — só emite em desenvolvimento (import.meta.env.DEV).
 * Use em substituição a console.log/warn/error/info/debug dispersos.
 */
const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;

function createLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => {
      if (isDev) console.log(prefix, ...args);
    },
    warn: (...args: unknown[]) => {
      if (isDev) console.warn(prefix, ...args);
    },
    error: (...args: unknown[]) => {
      if (isDev) console.error(prefix, ...args);
    },
    info: (...args: unknown[]) => {
      if (isDev) console.info(prefix, ...args);
    },
    debug: (...args: unknown[]) => {
      if (isDev) console.debug(prefix, ...args);
    },
  };
}

export const natsLogger = createLogger("[NATS]");
export const natsTelemetryLogger = createLogger("[NATS][telemetry]");
export const natsDashboardLogger = createLogger("[NATS][dashboard.events]");
export const natsGlobalPongLogger = createLogger("[NATS][global.pong]");
