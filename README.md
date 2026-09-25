# Zabbix Web Check

This is a Zabbix template for checking the health of one or more services running on a Zabbix host.

## Configuration

The template is configured via the following host macros:

### {$PUSHIT.WEBCHECK.CONFIG}

- Format: [Zabbix LLD] in JSON format

This macro holds the entire configuration for the individual endpoints. Every endpoint is represented as an item in the
LLD data list. See the **Endpoints config** section below.

### {$PUSHIT.WEBCHECK.HTTP.INTERVAL}

- Format: Zabbix time expression
- Example: `1m` -> every minute

This macro controls the interval in which the HTTP request is performed. This item is used as source for checks of TYPE
http_status and json_path.

### {$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}

- Format: Zabbix time expression
- Example: `3m`

This macro controls how long "no data" is tolerated on HTTP status checks before it is considered a problem.


### {$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}

- Format: Zabbix time expression
- Example: `3m`

This macro controls how long "no data" is tolerated on JSON path checks before it is considered a problem.

### {$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}

- Format: Zabbix time expression
- Example: `15m`

This macro controls the interval in which the x509 certificate data is retrieved. This item is used as source for checks
of TYPE certificate.

### {$PUSHIT.WEBCHECK.CERTIFICATE.NO_DATA_GRACE}

- Format: Zabbix time expression
- Example: `30m`

This macro controls how long "no data" is tolerated on certificate checks before it is considered a problem.

## Endpoints configuration

Every item in the list needs the following keys:

- `{#NAME}`: A unique value (on the host-level) which is suitable for use in a Zabbix Key value. This value will also be
  shown as additional identifier value for items.
- `{#URL}`: The endpoint to hit. Must contain a protocol (http/https), host and optionally port and path. If a port is
  not given, the default port for the protocol is assumed. If no path is given, the root path is assumed.
- `{#TYPE}`: The type of the check to  run, see **supported types** below.

### Supported types

#### http_status

##### Additional keys

- `{#EXPECT_STATUS}`: integer, expected HTTP status code.

##### Description

The endpoint is fetched and the HTTP status code is evaluated. If the status code does not match the value set by
`{#EXPECT_STATUS}`, a problem of HIGH severity is raised.

#### json_path

##### Additional keys

- `{#JSON_PATH}`: string, JSON path describing the field to select, e.g. `$.status`
- `{#EXPECT_VALUE}`: string, expected value in the field described by `{#JSON_PATH}`

##### Description

The endpoint is fetched and a single field in the response body is selected with the JSON path expression. If the
selected value does not match the value in `{#EXPECT_VALUE}`, a problem of HIGH severity is raised.

#### certificate

##### Additional keys

- `{#CERT_WARN_DAYS}`: integer, number of days
- `{#CERT_AVG_DAYS}`: integer, number of days
- `{#CERT_HIGH_DAYS}`: integer, number of days

##### Description

The certificate used by the endpoint is fetched and evaluated. Once a certificate has `{#CERT_WARN_DAYS}` days or less
left, a WARNING level problem is raised. Two more problems at `{#CERT_AVG_DAYS}` and `{#CERT_HIGH_DAYS}` will be raised
at AVERAGE and HIGH level respectively.

[Zabbix LLD]: https://www.zabbix.com/documentation/current/en/manual/discovery/low_level_discovery
