const chalk = require('chalk');
const { inspect } = require('util');
const { getLogSeverity } = require('./utils');
const loggers = require('./loggers');
const Severity = require('./Severity');

let longestCategory = 0;

module.exports = class Logger {
    constructor(category, options) {
        let _a, _b; 

        this._category = category;
        this._options = options;

        if (category.length > longestCategory) {
            longestCategory = category.length;
        }

        this._colors = (_a = options === null || options === void 0 ? void 0 : options.colors) !== null && _a !== void 0 ? _a : true;
        this._severity = (_b = options === null || options === void 0 ? void 0 : options.severity) !== null && _b !== void 0 ? _b : getLogSeverity();

        loggers.set(category, this);
    }

    _log(s, ...msg) {
        let log = console.log;

        switch (s) {
            case Severity.SILLY:
            case Severity.DEBUG:
                log = console.debug;
                break;

            case Severity.INFO:
                log = console.info;
                break;

            case Severity.WARN:
                log = console.warn;
                break;

            case Severity.ERROR:
            case Severity.FATAL:
                log = console.error;
                break;
        }

        log(...msg);
    }

    _prepareLog(s, socket, ...args) {
        if (s < this._severity) {
            return;
        }
        let datetime = new Date();

        const paddedCategory = this._category.padEnd(longestCategory, ' ');
        const paddedSeverity = Severity[s].padEnd(5, ' ');

        const category = this._colors
            ? chalk.gray.bold(paddedCategory)
            : paddedCategory;

        const severity = this._colors
            ? chalk.bold.white(paddedSeverity)
            : paddedSeverity;

        const lines = args
            .map((arg) =>
                typeof arg === 'string' || typeof arg === 'number'
                    ? arg.toString()
                    : inspect(arg)
            )
            .join(' ')
            .split('\n')
            .map((line) => `${category} [${datetime.toISOString().split('T')[0]} ${datetime.toISOString().split('T')[1].slice(0, -1)}] [${severity}] ${line}`);
            socket.emit('sendLog', `${paddedCategory} [${datetime.toISOString().split('T')[0]} ${datetime.toISOString().split('T')[1].slice(0, -1)}] [${paddedSeverity}] ${args}`)

        this._log(s, lines.join('\n'));
    }

    fatal(...msg) {
        this._prepareLog(Severity.FATAL, ...msg);
    }

    error(...msg) {
        this._prepareLog(Severity.ERROR, ...msg);
    }

    info(...msg) {
        this._prepareLog(Severity.INFO, ...msg);
    }

    warn(...msg) {
        this._prepareLog(Severity.WARN, ...msg);
    }

    debug(socket, ...msg) {
        this._prepareLog(Severity.DEBUG, socket, ...msg);
    }

    silly(...msg) {
        this._prepareLog(Severity.SILLY, ...msg);
    }

    get colors() {
        return this._colors;
    }

    set colors(b) {
        this._colors = b;
    }

    get severity() {
        return this._severity;
    }

    set severity(s) {
        this._severity = s;
    }
}
