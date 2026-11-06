// noinspection ES6ConvertVarToLetConst
/** @var {string} value Provided by the Zabbix runtime */

/**
 * The check that each key of an entry enables, in the order of {#TYPES}
 */
var checks = {
    "expectStatus": "http_status",
    "json_text": "json_path_text",
    "json_number": "json_path_number",
    "certificate": "certificate",
    "performance": "http_performance"
};
var entryKeys = ["url"].concat(Object.keys(checks));
var userMacro = /\{\$[A-Z0-9_.]+(?:: *(?:"(?:[^"\\]|\\"|\\(?!"))*" *|[^ "}][^}]*)?)?\}/;
var label;

/**
 * @param {object} obj
 * @param {string} propertyName
 * @returns {boolean}
 */
function has(obj, propertyName) {
    return Object.prototype.hasOwnProperty.call(obj, propertyName);
}

/**
 * Null-coalescing support for ECMAScript 5
 * @param {object} obj
 * @param {string} propertyName
 * @param {any} fallback
 * @returns {any}
 */
function getWithFallback(obj, propertyName, fallback) {
    if (has(obj, propertyName)) {
        return obj[propertyName];
    }
    return fallback;
}

/**
 * Stops the discovery with an error that names the entry and the key
 * @param {string} key such as "json_text.path"
 * @param {string} what what the value must be
 * @param {any} value
 */
function fail(key, what, value) {
    throw label + ": " + key + " must be " + what +
        (value === undefined ? ", but it is missing" : ", got " + JSON.stringify(value));
}

/**
 * @param {array} list
 * @returns {string} the quoted values as "a", "b" or "c"
 */
function either(list) {
    var quoted = [];

    for (var i = 0; i < list.length; i++) {
        quoted.push(JSON.stringify(list[i]));
    }
    return quoted.slice(0, -1).join(", ") + " or " + quoted[quoted.length - 1];
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}

/**
 * Rejects unknown keys, otherwise a typo silently disables a check or a level
 * @param {any} data
 * @param {string} key where the object is in the entry
 * @param {array} allowed
 */
function checkObject(data, key, allowed) {
    if (!isObject(data)) {
        fail(key, "a JSON object with the keys " + allowed.join(", "), data);
    }
    for (var name in data) {
        if (has(data, name) && allowed.indexOf(name) === -1) {
            throw label + ": unknown key " + JSON.stringify(name) + " in " + key + ", allowed keys are " +
                allowed.join(", ");
        }
    }
}

/**
 * Zabbix resolves user macros only after the discovery, so their values are unknown here and a value that contains
 * one is only checked for what does not depend on it
 * @param {any} data
 * @returns {boolean}
 */
function hasMacro(data) {
    return typeof data === "string" && userMacro.test(data);
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isText(data) {
    return typeof data === "string" && /\S/.test(data);
}

/**
 * The name is part of the item keys and is appended to the URL as #name, where agent 2 cannot parse a % that does
 * not start an escape sequence
 * @param {string} name
 * @returns {boolean}
 */
function isName(name) {
    return /^[A-Za-z0-9_.À-ÖØ-öø-ɏ-]+$/.test(name);
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isStatus(data) {
    if (hasMacro(data)) {
        return !/^\s|\s$/.test(data);
    }
    return (typeof data === "string" || typeof data === "number") && /^[1-5][0-9][0-9]$/.test(String(data));
}

/**
 * Checks the JSONPath syntax that Zabbix accepts: quoted names and index lists in brackets are replaced by a
 * placeholder, then the rest must be a chain of dot names followed by functions or a filter
 * @param {any} data
 * @returns {boolean}
 */
function isJsonPath(data) {
    var quoted = /\.{0,2}\[\s*'[^']+'(?:\s*(?:,\s*)?'[^']+')*\s*\]/g,
        indexes = /\.{0,2}\[\s*(?:\*\s*|-?\d+(?:(?:\s*,\s*|\s+)-?\d+)*\s*|(?:-?\d[-\d\s]*)?:[-\d\s]*)\]/g,
        path = /^\$(?:\.\.?(?:\*|[\w$]+))*(?:(?:\.\.?(?:min|max|avg|length|first|sum)\(\s*\)|~)*$|\.{0,2}\[\s*\?)/;

    if (typeof data !== "string" || /"|\s$/.test(data)) {
        return false;
    }
    if (hasMacro(data)) {
        return data.charAt(0) === "$" || data.search(userMacro) === 0;
    }
    return /^\$[^"]+$/.test(data) && path.test(data.replace(quoted, ".*").replace(indexes, ".*"));
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isScalar(data) {
    return (typeof data === "string" && !/^\s|\s$/.test(data)) || typeof data === "boolean" ||
        (typeof data === "number" && isFinite(data)) || data === null;
}

/**
 * A decimal number such as 30, -1 or 0.5, given as a JSON number or as a string
 * @param {any} data
 * @returns {boolean}
 */
function isNumber(data) {
    return (typeof data === "string" || typeof data === "number") && /^-?[0-9]+(\.[0-9]+)?$/.test(String(data));
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isNumberOrMacro(data) {
    if (hasMacro(data)) {
        return !/^\s|\s$/.test(data);
    }
    return isNumber(data);
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isLoadTime(data) {
    return isNumber(data) && ((Number(data) >= 0 && Number(data) < 600) || Number(data) === -1);
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isPeriod(data) {
    if (hasMacro(data)) {
        return !/^\s|\s$/.test(data);
    }
    return (typeof data === "string" || typeof data === "number") && /^[1-9][0-9]*[smhdw]?$/.test(String(data));
}

/**
 * Writes a number the same way however it is given, so that -1, "-1" and -1.0 all disable a level
 * @param {any} data a number or a value with a user macro
 * @returns {string}
 */
function normalize(data) {
    return hasMacro(data) ? data : String(Number(data));
}

/**
 * @param {object} data
 * @param {string} key such as "json_text"
 * @param {array} operators
 * @param {function} isExpected
 * @param {string} expected what the expected value must be
 */
function checkJson(data, key, operators, isExpected, expected) {
    checkObject(data, key, ["path", "expect", "operator"]);
    if (!isJsonPath(data.path)) {
        fail(key + ".path", "a JSONPath such as $.status or $.components['db-main'].status, without \" and without" +
            " spaces outside brackets", data.path);
    }
    if (!isExpected(data.expect)) {
        fail(key + ".expect", expected, data.expect);
    }
    if (has(data, "operator") && operators.indexOf(data.operator) === -1) {
        fail(key + ".operator", either(operators), data.operator);
    }
}

/**
 * @param {object} data
 * @param {string} key such as "certificate"
 * @param {string} levelName such as "warning"
 * @param {function} isLevel
 * @param {string} what what the level must be
 * @returns {string} the level, -1 if it is not set
 */
function getLevel(data, key, levelName, isLevel, what) {
    if (!has(data, levelName)) {
        return "-1";
    }
    if (!isLevel(data[levelName])) {
        fail(key + "." + levelName, what, data[levelName]);
    }
    return normalize(data[levelName]);
}

/**
 * JSON.parse keeps only the last of several properties with the same name, so an entry that was copied and not
 * renamed would silently replace the original one
 * @param {string} text the configuration, valid JSON
 * @returns {string|null} the first entry name that is used more than once
 */
function findDuplicateName(text) {
    var seen = {}, depth = 0, atName = false, i, end, c, name;

    for (i = 0; i < text.length; i++) {
        c = text.charAt(i);
        if (c === "\"") {
            for (end = i + 1; text.charAt(end) !== "\""; end++) {
                if (text.charAt(end) === "\\") {
                    end++;
                }
            }
            if (atName) {
                name = JSON.parse(text.substring(i, end + 1));
                if (has(seen, "#" + name)) {
                    return name;
                }
                seen["#" + name] = true;
                atName = false;
            }
            i = end;
        } else if (c === "{" || c === "[") {
            depth++;
            atName = c === "{" && depth === 1;
        } else if (c === "}" || c === "]") {
            depth--;
        } else if (c === "," && depth === 1) {
            atName = true;
        }
    }
    return null;
}

var configText, configData, duplicateName;
var output = [];

try {
    configText = JSON.parse(value).config;
    configData = JSON.parse(configText);
} catch (error) {
    throw "PUSHIT.WEBCHECK.CONFIG is not valid JSON: " + error.message;
}
if (Array.isArray(configData) || (isObject(configData) && Array.isArray(configData.data))) {
    throw "PUSHIT.WEBCHECK.CONFIG uses the list format of v0.3.x and earlier, convert it to a JSON object with one" +
        " property per endpoint as described in the upgrade notes in the CHANGELOG";
}
if (!isObject(configData)) {
    throw "PUSHIT.WEBCHECK.CONFIG must be a JSON object with one property per endpoint, got " +
        JSON.stringify(configData);
}
duplicateName = findDuplicateName(configText);
if (duplicateName !== null) {
    throw "Entry " + JSON.stringify(duplicateName) + " is defined more than once in PUSHIT.WEBCHECK.CONFIG";
}

for (var key in configData) {
    if (!has(configData, key)) {
        continue;
    }
    var item = configData[key];
    var checkTypes = [];

    label = "Entry " + JSON.stringify(key);
    if (!isName(key)) {
        throw label + ": the name must consist of Latin letters, digits, \"_\", \"-\" and \".\"";
    }
    if (!isObject(item)) {
        throw label + " must be a JSON object with the keys " + entryKeys.join(", ") + ", got " +
            JSON.stringify(item);
    }
    for (var itemKey in item) {
        if (has(item, itemKey) && entryKeys.indexOf(itemKey) === -1) {
            throw label + ": unknown key " + JSON.stringify(itemKey) + ", allowed keys are " + entryKeys.join(", ");
        }
    }
    if (!isText(item.url)) {
        fail("url", "a non-empty string", item.url);
    }

    var outputItem = {
        "{#NAME}": key,
        "{#URL}": item.url,
        // always set, the overrides of the HTTP rule fail on a missing macro
        "{#JSON_OPERATOR_TEXT}": "",
        "{#JSON_OPERATOR_NUMBER}": ""
    };

    // http_status check
    if (has(item, "expectStatus")) {
        if (!isStatus(item.expectStatus)) {
            fail("expectStatus", "a status code from 100 to 599 or a user macro", item.expectStatus);
        }
        outputItem["{#EXPECT_STATUS}"] = item.expectStatus;
    }

    // json_path_text check
    if (has(item, "json_text")) {
        checkJson(item.json_text, "json_text", ["=", "<>"], isScalar,
            "a string without leading or trailing spaces, a number, a boolean or null");
        outputItem["{#JSON_PATH_TEXT}"] = item.json_text.path;
        outputItem["{#EXPECT_VALUE_TEXT}"] = item.json_text.expect;
        outputItem["{#JSON_OPERATOR_TEXT}"] = getWithFallback(item.json_text, "operator", "=");
    }

    // json_path_number check
    if (has(item, "json_number")) {
        checkJson(item.json_number, "json_number", ["=", "<>", "<", "<=", ">", ">="], isNumberOrMacro,
            "a number such as 10 or -2.5, or a user macro");
        outputItem["{#JSON_PATH_NUMBER}"] = item.json_number.path;
        outputItem["{#EXPECT_VALUE_NUMBER}"] = normalize(item.json_number.expect);
        outputItem["{#JSON_OPERATOR_NUMBER}"] = getWithFallback(item.json_number, "operator", "=");
    }

    // certificate check, -1 disables a level
    if (has(item, "certificate")) {
        var days = "a number of days such as 30, -1 to disable the level, or a user macro";

        checkObject(item.certificate, "certificate", ["warning", "average", "high"]);
        outputItem["{#CERT_WARN_DAYS}"] = getLevel(item.certificate, "certificate", "warning", isNumberOrMacro, days);
        outputItem["{#CERT_AVG_DAYS}"] = getLevel(item.certificate, "certificate", "average", isNumberOrMacro, days);
        outputItem["{#CERT_HIGH_DAYS}"] = getLevel(item.certificate, "certificate", "high", isNumberOrMacro, days);
    }

    // http_performance check, -1 disables a level
    if (has(item, "performance")) {
        var seconds = "a load time in seconds below 600 such as 0.5, or -1 to disable the level";

        checkObject(item.performance, "performance", ["nodata", "warning", "average", "high", "disaster"]);
        if (!isPeriod(item.performance.nodata)) {
            fail("performance.nodata", "a time period such as \"3m\" or a user macro", item.performance.nodata);
        }
        outputItem["{#PERF_NODATA}"] = item.performance.nodata;
        outputItem["{#PERF_WARN}"] = getLevel(item.performance, "performance", "warning", isLoadTime, seconds);
        outputItem["{#PERF_AVG}"] = getLevel(item.performance, "performance", "average", isLoadTime, seconds);
        outputItem["{#PERF_HIGH}"] = getLevel(item.performance, "performance", "high", isLoadTime, seconds);
        outputItem["{#PERF_DISASTER}"] = getLevel(item.performance, "performance", "disaster", isLoadTime, seconds);

        // Calculate the timeout for the web.page.performance item as the highest trigger point plus one second. This
        // value is intentionally not configurable to avoid a configuration foot gun. Zabbix only accepts whole seconds
        // from 1 to 600, so it is rounded up, and it is never shorter than the default agent item timeout of 3 seconds.
        var performanceTimeout = Math.ceil(Math.max(
            Number(outputItem["{#PERF_WARN}"]),
            Number(outputItem["{#PERF_AVG}"]),
            Number(outputItem["{#PERF_HIGH}"]),
            Number(outputItem["{#PERF_DISASTER}"])
        )) + 1;
        outputItem["{#PERF_TIMEOUT}"] = Math.min(600, Math.max(3, performanceTimeout)) + "s";
    }

    for (var checkKey in checks) {
        if (has(item, checkKey)) {
            checkTypes.push(checks[checkKey]);
        }
    }
    if (checkTypes.length === 0) {
        throw label + ": no check configured, add at least one of " + Object.keys(checks).join(", ");
    }
    outputItem["{#TYPES}"] = checkTypes.join(",");
    output.push(outputItem);
}

// noinspection JSAnnotator
return JSON.stringify(output);
