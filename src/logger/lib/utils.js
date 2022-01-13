const loggers = require('./loggers');
const Severity = require('./Severity');

let currentSeverity = Severity.INFO;

module.exports = {
    setLogSeverity(s) {
        currentSeverity = s;

        for (const logger of loggers.values()) {
            logger.severity = s;
        }
    },
    getLogSeverity() {
        return currentSeverity;
    }
}
