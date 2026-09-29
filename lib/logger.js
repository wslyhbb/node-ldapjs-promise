import logger from 'abstract-logging';

logger.child = function () { return logger };

export default logger;