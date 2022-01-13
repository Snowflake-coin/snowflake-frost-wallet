const Severity = require('./lib/Severity');
const Logger = require('./lib/Logger');
const { setLogSeverity, getLogSeverity } = require('./lib/utils');

module.exports = {
  Severity,
  Logger,
  setLogSeverity,
  getLogSeverity
}