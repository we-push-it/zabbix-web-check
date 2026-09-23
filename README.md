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

The endpoint is fetched and the HTTP status code is evaluated.

[Zabbix LLD]: https://www.zabbix.com/documentation/current/en/manual/discovery/low_level_discovery
