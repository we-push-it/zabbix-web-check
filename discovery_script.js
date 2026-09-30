// noinspection ES6ConvertVarToLetConst
/** @var {string} value Provided by the Zabbix runtime */
/**
 * @param {object} data
 * @param {array} fields
 * @param {string} endpointName
 */
function requireFields(data, fields, endpointName) {
    for (var i in fields) {
        var fieldName = fields[i];
        if (data.hasOwnProperty(fieldName) === false) {
            throw 'Expected field "' + fieldName + '" to be set in endpoint config "' + endpointName + '"';
        }
    }
}

var configData = JSON.parse(JSON.parse(value).config);
var output = [];

for (var key in configData) {
    var item = configData[key];
    requireFields(item, ["url"], key);
    var checkTypes = [];
    var outputItem = {
        "{#NAME}": key,
        "{#URL}": item.url
    };

    // http_status check
    if (item.hasOwnProperty("expectStatus")) {
        checkTypes.push("http_status");
        outputItem["{#EXPECT_STATUS}"] = item.expectStatus;
    }

    // json_path_text check
    if (item.hasOwnProperty("json_text")) {
        checkTypes.push("json_path_text");
        requireFields(item.json_text, ["path", "expect"], key);
        outputItem["{#JSON_PATH_TEXT}"] = item.json_text.path;
        outputItem["{#EXPECT_VALUE_TEXT}"] = item.json_text.expect;
        outputItem["{#JSON_OPERATOR_TEXT}"] = "=";

        // allow overriding the operator
        if (item.json_text.hasOwnProperty("operator")) {
            // noinspection JSUndeclaredVariable intentionally not defined with var so it can be delete'd
            validOperators = ["=", "<>"];
            if (validOperators.indexOf(item.json_text.operator) === -1) {
                throw 'Unsupported operator "' + item.json_text.operator + '" in ' + key + '.json_text.operator';
            }
            outputItem["{#JSON_OPERATOR_TEXT}"] = item.json_text.operator;
            delete validOperators;
        }
    }

    // json_path_number check
    if (item.hasOwnProperty("json_number")) {
        checkTypes.push("json_path_number");
        requireFields(item.json_number, ["path", "expect"], key);
        outputItem["{#JSON_PATH_NUMBER}"] = item.json_number.path;
        outputItem["{#EXPECT_VALUE_NUMBER}"] = item.json_number.expect;
        outputItem["{#JSON_OPERATOR_NUMBER}"] = "=";

        // allow overriding the operator
        if (item.json_number.hasOwnProperty("operator")) {
            // noinspection JSUndeclaredVariable intentionally not defined with var so it can be delete'd
            validOperators = ["=", "<>", "<", "<=", ">", ">="];
            if (validOperators.indexOf(item.json_number.operator) === -1) {
                throw 'Unsupported operator "' + item.json_number.operator + '" in ' + key + '.json_number.operator';
            }
            outputItem["{#JSON_OPERATOR_NUMBER}"] = item.json_number.operator;
            delete validOperators;
        }
    }

    // certificate check
    if (item.hasOwnProperty("certificate")) {
        checkTypes.push("certificate");
        requireFields(item.certificate, ["warning", "average", "high"], key);
        outputItem["{#CERT_WARN_DAYS}"] = item.certificate.warning;
        outputItem["{#CERT_AVG_DAYS}"] = item.certificate.average;
        outputItem["{#CERT_HIGH_DAYS}"] = item.certificate.high;
    }

    if (checkTypes.length === 0) {
        throw "No valid check type "
    }
    outputItem["{#TYPES}"] = checkTypes.join(",");
    output.push(outputItem);
}

// noinspection JSAnnotator
return JSON.stringify(output);