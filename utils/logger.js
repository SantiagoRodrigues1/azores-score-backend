const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

function normalizeLevel(level) {
  if (!level) {
    return null;
  }

  const normalized = String(level).toLowerCase();
  return LEVELS[normalized] ? normalized : null;
}

function getCurrentLevel() {
  const configuredLevel = normalizeLevel(process.env.LOG_LEVEL);
  if (configuredLevel) {
    return configuredLevel;
  }

  if (process.env.DEBUG_LOGS === 'true') {
    return 'debug';
  }

  if (process.env.NODE_ENV === 'test') {
    return 'silent';
  }

  return 'info';
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[getCurrentLevel()];
}

function write(method, level, message, meta) {
  if (!shouldLog(level)) {
    return;
  }

  if (meta === undefined) {
    console[method](message);
    return;
  }

  console[method](message, meta);
}

module.exports = {
  debug(message, meta) {
    write('debug', 'debug', message, meta);
  },
  info(message, meta) {
    write('info', 'info', message, meta);
  },
  warn(message, meta) {
    write('warn', 'warn', message, meta);
  },
  error(message, meta) {
    write('error', 'error', message, meta);
  }
};