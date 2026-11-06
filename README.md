<h1 align="center">PUSH IT Webcheck</h1>

<p align="center">
  <strong>Every health endpoint and TLS certificate on a host, monitored from one Zabbix macro.</strong>
</p>

<p align="center">
  <a href="https://www.zabbix.com/"><img alt="Zabbix 7.4 or later" src="https://img.shields.io/badge/Zabbix-7.4%2B-D40000"></a>
  <img alt="Runs on Zabbix agent and Zabbix agent 2" src="https://img.shields.io/badge/agent-Zabbix%20agent%20%7C%20agent%202-1F6FEB">
  <img alt="Configured through a single JSON macro" src="https://img.shields.io/badge/config-one%20JSON%20macro-2EA043">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-blue"></a>
</p>

**PUSH IT Webcheck** is a Zabbix template for hosts that run web services. Describe the endpoints of a host as a
JSON object in the macro `{$PUSHIT.WEBCHECK.CONFIG}`, link the template, and low-level discovery creates the items and
triggers for HTTP status codes, for values inside JSON health responses, for HTTP page load time and for TLS certificate
validity and expiry.
All requests are made by the Zabbix agent on the monitored host itself: `http://localhost:8080/health` means port
8080 on that machine, not on the Zabbix server, so a service bound to `localhost` or to an internal port is as easy
to check as a public one.

## 📚 Table of contents

- [Features](#-features)
- [How it works](#-how-it-works)
- [Quick start](#-quick-start)
- [Endpoint configuration](#-endpoint-configuration)
- [Configuration examples](#-configuration-examples)
- [Migration from v0.3.x](#-migration-from-v03x)
- [Macros](#-macros)
- [Items and triggers](#-items-and-triggers)
- [Tips and gotchas](#-tips-and-gotchas)
- [Development](#-development)
- [License](#-license)

## ✨ Features

- 🩺 **Four kinds of checks.** `expectStatus` compares the HTTP status code, `json_text` and `json_number` compare a
  value inside a JSON body, `performance` measures the page load time and `certificate` watches TLS validity and expiry.
- 🧾 **One macro per host.** All endpoints live in `{$PUSHIT.WEBCHECK.CONFIG}`; no item cloning.
- 🏠 **Runs where the service runs.** Checks are Zabbix agent items, so `http://localhost:8080/health` works without
  exposing anything.
- 🧹 **Self-cleaning.** Remove an entry from the macro and its items and triggers are disabled on the next discovery
  run and deleted 7 days later; put it back before then and they return with their history.
- 📅 **Three-stage certificate alerts.** WARNING, AVERAGE and HIGH thresholds in days, chosen per endpoint.
- ⏱️ **Multi-stage performance alerts.** WARNING, AVERAGE, HIGH and DISASTER page load time thresholds in seconds,
  chosen per endpoint.
- ⏳ **Grace periods.** An endpoint that stops giving usable answers becomes a problem only after a configurable grace
  period; a wrong value is reported immediately. An unreachable agent is reported as WARNING (INFO for certificate
  checks), not as a failed check.
- 🛡️ **Checked configuration.** A mistake in the macro stops discovery with an error that says what is wrong and in
  which entry, instead of silently dropping a check.
- 🎚️ **Tunable with macros.** Intervals and grace periods are user macros you can override per host.

## 🧭 How it works

The template ships three discovery rules of type *Script*, **HTTP**, **Certificate** and **Performance**. Together they
turn the endpoints in `{$PUSHIT.WEBCHECK.CONFIG}` into items and triggers:

```mermaid
flowchart LR
    CFG(["Host macro<br/>{$PUSHIT.WEBCHECK.CONFIG}<br/>JSON object, one named property per endpoint"])

    subgraph DISCOVERY ["Discovery rules, every 10m"]
        DRULE_HTTP["HTTP<br/>entries with expectStatus, json_text or json_number"]
        DRULE_CERT["Certificate<br/>entries with certificate"]
        DRULE_PERF["Performance<br/>entries with performance"]
    end

    subgraph HTTP ["HTTP items, every HTTP.INTERVAL"]
        ITM_HTTP_RAW["Response {#NAME}<br/>web.page.get"]
        ITM_HTTP_STATUS["HTTP status {#NAME}<br/>status line regex"]
        ITM_JSON_TXT["JSON path (text) {#NAME}<br/>body + JSONPath"]
        ITM_JSON_NUM["JSON path (number) {#NAME}<br/>body + JSONPath"]
        ITM_JSON_READ["JSON path (number) readable {#NAME}<br/>1 if a number was read, else 0"]
    end

    subgraph PERFORMANCE ["Performance items, every HTTP.INTERVAL"]
        ITM_PERF["HTTP performance {#NAME}<br/>web.page.perf"]
    end

    subgraph CERTIFICATE ["Certificate items, raw data every CERTIFICATE.INTERVAL"]
        ITM_CERT_RAW["Certificate data {#NAME}<br/>web.certificate.get"]
        ITM_CERT_NOT_AFTER["Certificate expiration {#NAME}<br/>notAfter timestamp"]
        ITM_CERT_VALIDITY["Certificate validity {#NAME}<br/>verdict"]
        ITM_CERT_DAYS_REMAIN["Days until certificate expires ({#NAME})<br/>notAfter + JavaScript"]
    end

    subgraph TRG ["Triggers"]
        TRG_STATUS_NOT_MATCH{{"Unexpected status code<br/>HIGH"}}
        TRG_STATUS_ABSENT{{"No status code<br/>HIGH"}}
        TRG_STATUS_NODATA{{"No data for HTTP status<br/>WARNING"}}
        TRG_TXT_NOT_MATCH{{"JSON value does not match expected value (text)<br/>HIGH"}}
        TRG_TXT_MATCH{{"JSON value matches prohibited value (text)<br/>HIGH"}}
        TRG_TXT_ABSENT{{"No JSON value (text)<br/>HIGH"}}
        TRG_TXT_NODATA{{"No data for JSON path (text)<br/>WARNING"}}
        TRG_NUM_NOT_MATCH{{"JSON value does not match expected value (number)<br/>HIGH"}}
        TRG_NUM_MATCH{{"JSON value matches prohibited value (number)<br/>HIGH"}}
        TRG_NUM_LESS_THAN{{"JSON value is not below expected limit (number)<br/>HIGH"}}
        TRG_NUM_LESS_OR_EQUAL{{"JSON value exceeds expected maximum (number)<br/>HIGH"}}
        TRG_NUM_GREATER_THAN{{"JSON value is not above expected limit (number)<br/>HIGH"}}
        TRG_NUM_GREATER_OR_EQUAL{{"JSON value is below expected minimum (number)<br/>HIGH"}}
        TRG_NUM_ABSENT{{"No JSON value (number)<br/>HIGH"}}
        TRG_NUM_NODATA{{"No data for JSON path (number)<br/>WARNING"}}
        TRG_CERT_ABSENT{{"Certificate data unavailable<br/>INFO"}}
        TRG_CERT_INVALID{{"Certificate is invalid<br/>HIGH"}}
        TRG_CERT_EXPIRY{{"Certificate will expire in N days or less<br/>N = CERT_WARN / AVG / HIGH_DAYS<br/>WARNING / AVERAGE / HIGH"}}
        TRG_PERF_ABSENT{{"Missing HTTP performance data<br/>WARNING"}}
        TRG_PERF_LIMIT{{"Performance exceeds limit<br/>PERF_WARN / AVG / HIGH / DISASTER<br/>WARNING / AVERAGE / HIGH / DISASTER"}}
    end

    CFG --> DRULE_HTTP & DRULE_CERT & DRULE_PERF
    DRULE_HTTP --> ITM_HTTP_RAW
    ITM_HTTP_RAW -->|expectStatus present| ITM_HTTP_STATUS
    ITM_HTTP_RAW -->|json_text present| ITM_JSON_TXT
    ITM_HTTP_RAW -->|json_number present| ITM_JSON_NUM & ITM_JSON_READ
    DRULE_CERT --> ITM_CERT_RAW
    ITM_CERT_RAW --> ITM_CERT_NOT_AFTER & ITM_CERT_VALIDITY & ITM_CERT_DAYS_REMAIN
    ITM_HTTP_STATUS --> TRG_STATUS_NOT_MATCH & TRG_STATUS_ABSENT & TRG_STATUS_NODATA
    ITM_JSON_TXT -->|"operator is = (default)"| TRG_TXT_NOT_MATCH
    ITM_JSON_TXT -->|"operator is <>"| TRG_TXT_MATCH
    ITM_JSON_TXT --> TRG_TXT_ABSENT & TRG_TXT_NODATA
    ITM_CERT_RAW --> TRG_CERT_ABSENT
    ITM_CERT_VALIDITY --> TRG_CERT_INVALID
    ITM_CERT_DAYS_REMAIN --> TRG_CERT_EXPIRY
    ITM_JSON_NUM -->|"operator is = (default)"| TRG_NUM_NOT_MATCH
    ITM_JSON_NUM -->|"operator is <>"| TRG_NUM_MATCH
    ITM_JSON_NUM -->|"operator is <"| TRG_NUM_LESS_THAN
    ITM_JSON_NUM -->|"operator is <="| TRG_NUM_LESS_OR_EQUAL
    ITM_JSON_NUM -->|"operator is >"| TRG_NUM_GREATER_THAN
    ITM_JSON_NUM -->|"operator is >="| TRG_NUM_GREATER_OR_EQUAL
    ITM_JSON_READ -.-> TRG_NUM_NOT_MATCH & TRG_NUM_MATCH & TRG_NUM_LESS_THAN & TRG_NUM_LESS_OR_EQUAL & TRG_NUM_GREATER_THAN & TRG_NUM_GREATER_OR_EQUAL
    ITM_JSON_READ --> TRG_NUM_ABSENT & TRG_NUM_NODATA
    DRULE_PERF --> ITM_PERF
    ITM_PERF --> TRG_PERF_ABSENT & TRG_PERF_LIMIT
```

Step by step:

1. **Configuration.** Every endpoint is one property of the JSON object in the host macro `{$PUSHIT.WEBCHECK.CONFIG}`:
   the property name is the name of the entry, its value lists the URL and the checks to run on it.
2. **Discovery.** All three rules run every 10 minutes, receive the macro through the script parameter `config` and run
   the same script. It checks every entry; a mistake stops all three rules with an error that names the entry, see
   [Tips and gotchas](#-tips-and-gotchas). Otherwise it returns one row of LLD macros per entry, with `{#TYPES}` listing
   the checks of the entry. A filter on `{#TYPES}` decides which rules handle an entry: **HTTP** takes entries with
   `expectStatus`, `json_text` or `json_number`, **Certificate** those with `certificate` and **Performance** those with
   `performance`.
3. **Collecting items.** Each entry gets the Zabbix agent items that talk to the endpoint:
   `web.page.get["{#URL}#{#NAME}"]` for HTTP status and JSON checks, `web.certificate.get["{#URL}#{#NAME}"]` for
   certificate checks and `web.page.perf["{#URL}#{#NAME}"]` for performance checks, so performance makes a request of
   its own. The fragment `#{#NAME}` is never sent to the endpoint. It keeps the item keys unique, so several entries can
   check the same URL, and it is part of the key that `AllowKey` and `DenyKey` rules of the agent are matched against.
4. **Derived items.** Dependent items extract the interesting part with preprocessing (regular expression and
   JSONPath). Their keys carry the same parameter as the raw item, for example
   `pushit.webcheck.http.status["{#URL}#{#NAME}"]`, so a new URL replaces all items of the entry at once: Zabbix
   never moves an existing dependent item to a new raw item. Overrides in the HTTP rule make sure that only the
   dependent items of the checks configured for the entry are created. The certificate rule adds a dependent item that
   reads the `notAfter` timestamp from the same raw data and turns it into days with JavaScript.
5. **Triggers.** Trigger prototypes compare the values with your expectations and also raise a problem when no usable
   value has arrived within the grace period. Overrides discover only the comparison trigger of the configured
   operator, and leave out the triggers of certificate and performance levels that are omitted or set to `-1`.
6. **Cleanup.** Lost resources are disabled immediately and deleted after 7 days. When an entry leaves the macro, its
   items and triggers are disabled on the next discovery run. If the entry comes back within 7 days, the same items are
   enabled again with their history; otherwise items, triggers and history are deleted. An entry with a new name or
   `url` counts as a new entry: the old one is cleaned up as if it had been removed.

Changes to the macro take effect on the next discovery run, at most 10 minutes later, or right away with **Execute now**
on the three discovery rules.

## 🚀 Quick start

From download to the first problem in Zabbix in six steps. Updating from v0.3.x or older? Read
[Migration from v0.3.x](#-migration-from-v03x) first.

### Requirements

| Requirement | Why |
|---|---|
| Zabbix server 7.4 or later | `template.dist.yaml` is a Zabbix 7.4 export (`zabbix_export.version: '7.4'`); import it into Zabbix 7.4 or a later release. |
| A Zabbix agent on the monitored host | HTTP status and JSON checks use `web.page.get`, performance checks `web.page.perf`; both are available in the classic Zabbix agent and in Zabbix agent 2. For agents older than 7.0, see **Slow endpoints and the item timeout** in [Tips and gotchas](#-tips-and-gotchas). |
| Zabbix agent 2 for `certificate` checks | `web.certificate.get` exists in Zabbix agent 2 only. |
| An agent interface on the host | All collecting items are passive *Zabbix agent* items, so the server or proxy must be able to poll the agent. |
| A network path from the agent to the endpoints | Requests are made from the agent, not from the Zabbix server or proxy. `localhost` is the monitored host itself. |

### Steps

1. **Download** `template.dist.yaml` from the assets of the
   [latest release](https://github.com/we-push-it/zabbix-web-check/releases/latest). The `template.yaml` in the
   repository is only its source and lacks the discovery script: imported on its own, all three discovery rules turn
   *Not supported* with
   `Cannot execute script: This is the unbuilt source template.yaml, import template.dist.yaml from https://github.com/we-push-it/zabbix-web-check/releases instead`.
2. **Import the template.** Go to *Data collection → Templates*, click **Import**, select `template.dist.yaml`, keep
   the default import rules and click **Import**. **PUSH IT Webcheck** now appears in the template group *Templates*.
3. **Link it to the host** that runs the services: open the host under *Data collection → Hosts* and, on the *Host*
   tab, type `PUSH IT Webcheck` into the *Templates* field, select it and click **Update**.
4. **Configure the endpoints.** Open the host again, switch to the *Macros* tab, select *Inherited and host macros*,
   click **Change** next to `{$PUSHIT.WEBCHECK.CONFIG}` and paste your endpoint configuration as one line of JSON.
   For a first test, a single HTTP status check is enough (adjust the host, port and path):

   ```json
   {"app":{"url":"http://localhost:8080/health","expectStatus":"200"}}
   ```

   Click **Update**.
5. **Run discovery.** Wait for the next run (up to 10 minutes) or open *Data collection → Hosts*, click *Discovery*
   in the row of your host, select **HTTP**, **Certificate** and **Performance** and click **Execute now**. Give the
   server a few seconds after saving the macro so that its configuration cache has picked up the new value.
6. **Check the result.** *Monitoring → Latest data*, filtered by your host, shows **HTTP status app** with the value
   `200`. **Response app** is listed without a value: it fetches the raw HTTP response but does not store it. If the
   endpoint answers with a different status code, *Monitoring → Problems* shows **Unexpected status code for app**.
   If the request fails, for example because nothing listens on the port, **No status code for app** appears: for a
   new entry with the first failed request, for an entry that has worked before once no status code has arrived for
   3 minutes. Both problems have severity HIGH.

From here, extend the configuration with the [configuration examples](#-configuration-examples). Every later change to
the macro follows the same path: edit the value, then wait for the next discovery run or use **Execute now**.

## 🧩 Endpoint configuration

`{$PUSHIT.WEBCHECK.CONFIG}` holds a JSON object. Each property is one entry: the property name is the human-readable
name of the endpoint, the value is an object with the `url` and one key per check to run on it. One entry can combine
all checks.

```json
{
  "my-application": {
    "url": "https://example.org/health",
    "expectStatus": "200"
  }
}
```

The name is appended to the URL as `#name` in the key of every item of the entry, such as
`pushit.webcheck.http.status["https://example.org/health#my-application"]`, and appears in item and trigger names. Use
only Latin letters (accented letters such as `ä` or `ß` included), digits, `_`, `-` and `.`; no spaces, commas,
brackets, quotes or `%`. Each name can be used only once: a JSON parser keeps only the last of two properties with the
same name, so instead of silently dropping an entry, the discovery rules stop with
`Entry "my-application" is defined more than once in PUSHIT.WEBCHECK.CONFIG`.

> **The discovery rules check every entry** before they create anything, and stop with an error that names the entry
> when they find a mistake, for example an unknown key, a missing value or an entry without a check.
> [Tips and gotchas](#-tips-and-gotchas) lists what they check and what only Zabbix notices later.

### Common keys

| Key | Description |
|---|---|
| `url` | Required. The endpoint as `scheme://host[:port][/path]`, a non-empty string. The default port of the scheme and the root path apply when omitted. |

Every entry also needs at least one of the check keys `expectStatus`, `json_text`, `json_number`, `performance` and
`certificate`, described below. An entry with only a `url` stops the discovery with
`Entry "my-application": no check configured, add at least one of expectStatus, json_text, json_number, certificate, performance`.

### Checking the HTTP status

This check is enabled by setting `expectStatus`. It fetches the URL every `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` (default
`1m`) with the agent item [`web.page.get`](https://www.zabbix.com/documentation/current/en/manual/config/items/itemtypes/zabbix_agent)
and compares the status code of the final response; interim responses such as `103 Early Hints` are skipped. The body
is not evaluated.

```json
{
  "my-application": {
    "url": "https://example.org/",
    "expectStatus": "200"
  }
}
```

| Key | Description |
|---|---|
| `expectStatus` | Expected status code from 100 to 599, compared numerically, as a string such as `"200"` or a number such as `200`. `"200"` for a plain health endpoint, but any code works, for example `"401"` for an endpoint that is supposed to demand authentication. A user macro such as `"{$APP.STATUS}"` works as well. Any other code raises **Unexpected status code for {#NAME}** (HIGH). |

If the request fails, for example because nothing listens on the port, **No status code for {#NAME}** (HIGH) fires
once no status code has arrived for `{$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}` (default `3m`), and for a new
entry with the first failed request. **No data for HTTP status {#NAME}** (WARNING) fires when nothing arrives at all
for that time, usually because the agent is not reachable.

### Checking a value in a JSON body

This check is enabled by setting `json_text`, `json_number` or both. Some status pages provide a machine-readable JSON
version. You can use this check to query a specific field described by a [Zabbix JSONPath]. It fetches the URL every
`{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` (default `1m`) with the same `web.page.get` item as the HTTP status check, drops
the response headers, treats the body as JSON and compares the selected value. The status code is not evaluated by
this check; add `expectStatus` to the entry if you need both.

`json_text` compares the value as text. `json_number` reads it as a number, which Zabbix can graph, and also offers
the comparisons `<`, `<=`, `>` and `>=`. An entry has at most one of each; to check more values of the same URL, add
another entry with the same `url`, which makes a request of its own (see [example 5](#5-two-entries-for-the-same-url)).

```json
{
  "my-application": {
    "url": "https://example.org/health.json",
    "json_text": {
      "path": "$.status",
      "expect": "healthy"
    },
    "json_number": {
      "path": "$.unhealthyNodes",
      "expect": 0
    }
  }
}
```

| Key | Description |
|---|---|
| `path` | Required. [Zabbix JSONPath] expression selecting the value, for example `$.status` or `$.components.db.status`. Use a definite path: an expression that returns a list yields a JSON array as text, which is hard to compare. Strings inside the expression need single quotes, for example `$['app-version']` or `$.checks[?(@.name=='db')].status.first()`; double quotes stop the discovery with an error. Backslashes work inside such strings, for example in a regular expression; in the JSON of the macro each one is written as `\\`, as in `"$.checks[?(@.name =~ '^db\\d$')].status.first()"`. |
| `expect` | Required. The value to compare against. For `json_text` a string without leading or trailing spaces, a number, a boolean or `null`. JSON strings arrive without quotes (`UP`), booleans, numbers and `null` as text (`true`, `200`, `null`). Values that look like numbers are compared numerically, Zabbix suffixes included, so `1.10` equals `1.1` and `1K` equals `1024`; everything else is compared as a string. For `json_number` a decimal number such as `0`, `10` or `-2.5`, as a JSON number or as a string. A user macro such as `{$APP.VERSION}` works in both and is resolved before the comparison. |
| `operator` | Optional. The comparison the selected value must satisfy against `expect`; `"="` when omitted. See below for the allowed operators. |

#### Allowed operators

| Operator | Healthy condition | Supported checks |
|---|---|---|
| `=` (default) | Value equals `expect` | Text and number |
| `<>` | Value differs from `expect` | Text and number |
| `<` | Value is less than `expect` | Number only |
| `<=` | Value is less than or equal to `expect` | Number only |
| `>` | Value is greater than `expect` | Number only |
| `>=` | Value is greater than or equal to `expect` | Number only |

A value that does not satisfy the comparison raises a problem with severity HIGH right away. It stays open until a
value arrives that satisfies the comparison again.

When no value can be read, because the request fails, the body is not JSON or the path matches nothing, and for
`json_number` also when the value is not a number (such as `"n/a"`, `true` or `null`), the comparison triggers do not
fire. Instead, **No JSON value for {#NAME} (text)** or **No JSON value for {#NAME} (number)** (HIGH) fires once no
value has been read for `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}` (default `3m`), and for a new entry with the
first poll that yields no value. It takes over from an open comparison problem, which is resolved at the same time.
**No data for JSON path (text) {#NAME}** or **No data for JSON path (number) {#NAME}** (WARNING) fires when nothing
arrives at all for that time, usually because the agent is not reachable.

### Checking HTTP performance

This check is enabled by setting `performance`. The **Performance** discovery rule creates an agent item
[`web.page.perf`](https://www.zabbix.com/documentation/7.4/en/manual/config/items/itemtypes/zabbix_agent#web.page.perf)
that measures the loading time of the full page in seconds, every `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` (default `1m`).
It makes a request of its own, separate from the HTTP status and JSON checks of the entry.

```json
{
  "my-application": {
    "url": "https://example.org/health",
    "performance": {
      "nodata": "3m",
      "warning": 0.5,
      "average": 1,
      "high": 2,
      "disaster": 5
    }
  }
}
```

Only the `nodata` key is required; a level that is omitted or set to `-1` gets no trigger. This allows you to decide
whether you want all levels or go from warning directly to high - skipping average for example.

| Key | Description |
|---|---|
| `nodata` | Required. No-data grace period as a Zabbix time period such as `"3m"` (a whole number with an optional suffix `s`, `m`, `h`, `d` or `w`) or a user macro. Raises **Missing HTTP performance data for {#NAME}** (WARNING) when no load time has been measured during this period. Choose a value larger than `HTTP.INTERVAL`. |
| `warning` | Load time in seconds above which a WARNING problem is raised: a number from `0` to below `600`, for example `0.5`, or `-1` to disable the level. User macros are not allowed here. |
| `average` | Load time in seconds above which an AVERAGE problem is raised, with the same rules. |
| `high` | Load time in seconds above which a HIGH problem is raised, with the same rules. |
| `disaster` | Load time in seconds above which a DISASTER problem is raised, with the same rules. |

Choose `warning` < `average` < `high` < `disaster`. Comparisons are strictly `>`: a value equal to a threshold does not
fire that trigger. The threshold triggers are independent, so a value above `disaster` raises all four problems.

The item has a timeout of its own: the highest enabled threshold rounded up to whole seconds, plus 1 second, at least
`3s` and at most `600s`. The example above gets `6s`, an entry with only `nodata` gets `3s`. The global item timeout
does not apply to this item. A page that takes longer than the timeout, a refused connection or any other failed
request makes the item *Not supported* instead of giving a load time. The threshold triggers then turn *Unknown* and
keep their last value, so an open problem stays open and no new one is raised, and only
**Missing HTTP performance data for {#NAME}** (WARNING) fires once `nodata` has passed. A page that does not answer
at all is therefore reported with a lower severity than a slow one; add `expectStatus` to the entry to get
**No status code for {#NAME}** (HIGH) for failed requests.

### Checking a certificate

This check is enabled by setting `certificate`. It opens a TLS connection every
`{$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}` (default `15m`) with the agent 2 item
[`web.certificate.get`](https://www.zabbix.com/documentation/current/en/manual/config/items/itemtypes/zabbix_agent/zabbix_agent2),
validates the certificate chain for the host name in the URL and reads the expiry date. The URL must use the `https`
scheme; a port is optional, a path is ignored. This check needs **Zabbix agent 2**. The chain is validated against the
system trust store of the agent host, so a certificate issued by an internal CA reports `invalid` until that CA is
installed there and agent 2 has been restarted. At the time of writing (Zabbix agent 2 version 7.4.15), this check
**does not consider certificate revocation lists**. A revoked certificate will show up as valid until it expires. This
is a limitation of the `web.certificate.get` item.

```json
{
  "my-application": {
    "url": "https://example.org/",
    "certificate": {
      "warning": 30,
      "average": 14,
      "high": 7
    }
  }
}
```

| Key | Description |
|---|---|
| `warning` | Days before expiry at which a WARNING problem is raised: a number such as `30` or `"30"`, or a user macro. `-1` disables the level. |
| `average` | Days before expiry at which an AVERAGE problem is raised, with the same rules. |
| `high`    | Days before expiry at which a HIGH problem is raised, with the same rules. |

Choose the thresholds so that `warning` > `average` > `high`, for example `30`, `14` and `7`. If you do not want to
use a specific level, omit it from the configuration or set it to `-1`: its trigger is not discovered, and an existing
one is disabled and deleted 7 days later. `"certificate": {}` only checks the validity.

## 📋 Configuration examples

Every example is a complete, valid value for `{$PUSHIT.WEBCHECK.CONFIG}` and follows the rules from
[Endpoint configuration](#-endpoint-configuration).

The examples are pretty-printed for readability. In the macro value the same JSON is usually pasted as one line, as
shown in the [compact form](#compact-form) at the end of this section. Whitespace is irrelevant to JSON but counts
towards the 2048-character macro limit.

### 1. Minimal: one HTTP status check

A single service on port 8080 whose health endpoint must answer `200`.

```json
{
  "app": {
    "url": "http://localhost:8080/health",
    "expectStatus": "200"
  }
}
```

**What you get for `app`**

| Object | Name | Severity |
|---|---|---|
| Item | Response app | – |
| Item | HTTP status app | – |
| Trigger | Unexpected status code for app | HIGH |
| Trigger | No status code for app | HIGH |
| Trigger | No data for HTTP status app | WARNING |

The raw response is fetched every minute. **Unexpected status code for app** fires as soon as a code other than `200`
arrives. **No status code for app** fires when no code could be read for 3 minutes, for example because the endpoint
refuses connections; for a new entry it fires with the first failed request. **No data for HTTP status app** fires
when nothing arrives at all for 3 minutes, usually because the agent is not reachable.

Any status code works as expectation. An endpoint behind authentication, for example, should answer `401`:

```json
{
  "admin-login": {
    "url": "http://localhost:8080/admin",
    "expectStatus": "401"
  }
}
```

### 2. JSON health endpoints

Spring Boot Actuator answers `GET /actuator/health` with a body such as `{"status":"UP"}`. The first entry selects
`$.status` and expects `UP`. The second watches a cluster which must report fewer than 10 failed tasks, the
third reads a boolean from a body like `{"ready":true}`, which is compared as the string `"true"`. The fourth monitors
a queue-worker, which must *not* report the queue status as "full" (`{"queueStatus":"FULL"}`). All four endpoints must
answer without authentication.

```json
{
  "shop-api": {
    "url": "http://localhost:8080/actuator/health",
    "json_text": {
      "path": "$.status",
      "expect": "UP"
    }
  },
  "search": {
    "url": "http://localhost:9200/_cluster/health",
    "json_number": {
      "path": "$.failedTasks",
      "expect": 10,
      "operator": "<"
    }
  },
  "worker": {
    "url": "http://localhost:3000/healthz",
    "json_text": {
      "path": "$.ready",
      "expect": "true"
    }
  },
  "queue-worker": {
    "url": "http://localhost:8081/status.json",
    "json_text": {
      "path": "$.queueStatus",
      "expect": "FULL",
      "operator": "<>"
    }
  }
}
```

**What you get**

| Object | Name | Severity |
|---|---|---|
| Item | Response shop-api / search / worker / queue-worker | – |
| Item | JSON path (text) shop-api / worker / queue-worker | – |
| Item | JSON path (number) search | – |
| Item | JSON path (number) readable search | – |
| Trigger | JSON value for shop-api does not match expected value (text) | HIGH |
| Trigger | JSON value for search is not below expected limit (number) | HIGH |
| Trigger | JSON value for worker does not match expected value (text) | HIGH |
| Trigger | JSON value for queue-worker matches prohibited value (text) | HIGH |
| Trigger | No JSON value for shop-api / worker / queue-worker (text) | HIGH |
| Trigger | No JSON value for search (number) | HIGH |
| Trigger | No data for JSON path (text) shop-api / worker / queue-worker | WARNING |
| Trigger | No data for JSON path (number) search | WARNING |

The **does not match expected value** triggers fire when `shop-api` / `worker` differs from `UP` / `true` respectively.
For `search`, the trigger **is not below expected limit** will fire if 10 or more tasks are reported as failed.
For `queue-worker`, the configured comparison is `<> "FULL"`, so its **matches prohibited value**
trigger fires when the selected value is `FULL`.
**No JSON value for ...** fires when no value could be read for 3 minutes, for example because the service is down,
the body is not JSON or the path does not match, and for `search` also when `failedTasks` is not a number; for a new
entry it fires with the first poll that yields no value. **No data for JSON path ...** fires when nothing arrives at
all for 3 minutes, usually because the agent is not reachable.

### 3. Certificate expiry with three thresholds

Warn 30 days before the certificate expires, escalate to AVERAGE at 14 days and to HIGH at 7 days.

```json
{
  "www-cert": {
    "url": "https://www.example.com",
    "certificate": {
      "warning": 30,
      "average": 14,
      "high": 7
    }
  }
}
```

**What you get for `www-cert`**

| Object | Name | Severity |
|---|---|---|
| Item | Certificate data www-cert | – |
| Item | Certificate expiration www-cert | – |
| Item | Certificate validity www-cert | – |
| Item | Days until certificate expires (www-cert) | – |
| Trigger | Certificate data for www-cert is unavailable | INFO |
| Trigger | Certificate for www-cert is invalid | HIGH |
| Trigger | Certificate for www-cert will expire in 30 days or less (WARN) | WARNING |
| Trigger | Certificate for www-cert will expire in 14 days or less (AVERAGE) | AVERAGE |
| Trigger | Certificate for www-cert will expire in 7 days or less (HIGH) | HIGH |

The certificate data is fetched every 15 minutes, the days value is recalculated with every fetch. Use the name the
certificate was issued for (here `www.example.com`), not `localhost`, otherwise the check reports `invalid`.

### 4. A realistic host: several services, all types

A shop server. The public storefront is checked through its own name for status code, certificate and page load time.
Two Spring Boot services answer with JSON health, a protected admin interface is expected to answer `401` without
credentials, and an API on port 8443 has a certificate of its own. `billing-db` reads a component status,
which Actuator only includes when `management.endpoint.health.show-components` or `show-details` is set to `always`
(`when-authorized` does not help: the agent only sends credentials that are part of the URL, and those
[do not belong there](#-tips-and-gotchas)).

```json
{
  "shop-frontend": {
    "url": "https://shop.example.com",
    "expectStatus": "200",
    "performance": {
      "nodata": "3m",
      "warning": 0.5,
      "average": 1,
      "high": 2,
      "disaster": 5
    },
    "certificate": {
      "warning": 30,
      "average": 14,
      "high": 7
    }
  },
  "orders-api": {
    "url": "http://localhost:8080/health",
    "json_number": {
      "path": "$.failedOrders",
      "expect": 0
    }
  },
  "billing-db": {
    "url": "http://localhost:8081/actuator/health",
    "json_text": {
      "path": "$.components.db.status",
      "expect": "UP"
    }
  },
  "admin-auth": {
    "url": "https://shop.example.com/admin",
    "expectStatus": "401"
  },
  "api": {
    "url": "https://api.example.com:8443",
    "expectStatus": "200",
    "certificate": {
      "warning": 21,
      "average": 10,
      "high": 3
    }
  }
}
```

### 5. Two entries for the same URL

An entry has at most one `json_text` check. To compare two values of the same health response, use two entries with
the same `url`. The name in the item keys keeps their items apart; each entry fetches the URL on its own.

```json
{
  "payments": {
    "url": "http://localhost:8080/actuator/health",
    "expectStatus": "200",
    "json_text": {
      "path": "$.status",
      "expect": "UP"
    }
  },
  "payments-db": {
    "url": "http://localhost:8080/actuator/health",
    "json_text": {
      "path": "$.components.db.status",
      "expect": "UP"
    }
  }
}
```

### Compact form

The macro value is the same JSON without line breaks and indentation. This is
[example 4](#4-a-realistic-host-several-services-all-types) exactly as it goes into the macro field:

```json
{"shop-frontend":{"url":"https://shop.example.com","expectStatus":"200","performance":{"nodata":"3m","warning":0.5,"average":1,"high":2,"disaster":5},"certificate":{"warning":30,"average":14,"high":7}},"orders-api":{"url":"http://localhost:8080/health","json_number":{"path":"$.failedOrders","expect":0}},"billing-db":{"url":"http://localhost:8081/actuator/health","json_text":{"path":"$.components.db.status","expect":"UP"}},"admin-auth":{"url":"https://shop.example.com/admin","expectStatus":"401"},"api":{"url":"https://api.example.com:8443","expectStatus":"200","certificate":{"warning":21,"average":10,"high":3}}}
```

You can use `jq` to produce the compact form from a pretty-printed file and if you chain it with `wc`, you can count the
characters to ensure you stay below the Zabbix-imposed 2048-character limit:

```sh
jq -c . webcheck.json            # validate and print the compact form
jq -cj . webcheck.json | wc -m   # count its characters: at most 2048 fit into a macro value
```

## 🔄 Migration from v0.3.x

Up to v0.3.x, `{$PUSHIT.WEBCHECK.CONFIG}` was a JSON array with one object per entry, whose keys were LLD macros.
This version reads the JSON object described above, and all three discovery rules stop on the old format with
`Cannot execute script: PUSHIT.WEBCHECK.CONFIG uses the list format of v0.3.x and earlier, convert it to a JSON object with one property per endpoint as described in the upgrade notes in the CHANGELOG`.
Convert the macro wherever you set it, usually on every host that uses the template. If you run v0.2.x or older,
update to v0.3.0 first and follow its upgrade notes in the [CHANGELOG](CHANGELOG.md).

### Key mapping

| v0.3.x | Now |
|---|---|
| `{#NAME}` | The property name of the entry |
| `{#URL}` | `url` |
| `{#TYPES}` | No key of its own; the check keys below enable the checks |
| `{#EXPECT_STATUS}` (`http_status`) | `expectStatus` |
| `{#JSON_PATH}` and `{#EXPECT_VALUE}` (`json_path`) | `path` and `expect` in `json_text` |
| `{#CERT_WARN_DAYS}`, `{#CERT_AVG_DAYS}` and `{#CERT_HIGH_DAYS}` (`certificate`) | `warning`, `average` and `high` in `certificate`; `-1` now disables a level |

A v0.3.x entry such as

```json
[{"{#NAME}":"app","{#TYPES}":"http_status,json_path","{#URL}":"http://localhost:8080/health","{#EXPECT_STATUS}":"200","{#JSON_PATH}":"$.status","{#EXPECT_VALUE}":"UP"}]
```

becomes

```json
{"app":{"url":"http://localhost:8080/health","expectStatus":"200","json_text":{"path":"$.status","expect":"UP"}}}
```

In v0.3.x an HTTP entry and a certificate entry could share a `{#NAME}`. Now they are one entry, which needs a single
URL. Rename one of them if their URLs differ.

### Converting the macro with jq

Save the current value of the macro in a file, here `webcheck-v03.json`, and run this [jq](https://jqlang.github.io/jq/)
command (jq 1.6 or later). It prints the new value as one line, ready to paste into the macro:

```sh
jq -c '
  (if type == "object" then .data else . end)
  | map(. as $e
      | ($e["{#TYPES}"] | if type == "array" then join(",") else . end
         | split(",") | map(gsub("^\\s+|\\s+$"; "") | ascii_downcase)) as $types
      | {($e["{#NAME}"]): ({url: $e["{#URL}"]}
          + (if $types | index("http_status") then {expectStatus: $e["{#EXPECT_STATUS}"]} else {} end)
          + (if $types | index("json_path") then
               {json_text: {path: $e["{#JSON_PATH}"], expect: $e["{#EXPECT_VALUE}"]}} else {} end)
          + (if $types | index("certificate") then
               {certificate: {warning: $e["{#CERT_WARN_DAYS}"], average: $e["{#CERT_AVG_DAYS}"],
                              high: $e["{#CERT_HIGH_DAYS}"]}} else {} end))})
  | reduce .[] as $entry ({}; ($entry | keys[0]) as $name
      | if has($name) and .[$name].url != $entry[$name].url
        then error("\($name) is used for two URLs, rename one of the entries")
        else .[$name] += $entry[$name] end)
' webcheck-v03.json
```

The command expects a value that v0.3.x accepts. It takes over every name, URL and value unchanged, so the items keep
their keys, and it merges an HTTP entry and a certificate entry with the same `{#NAME}` and URL. For two such entries
with different URLs, it stops with `<name> is used for two URLs, rename one of the entries`. JSON checks become
`json_text` checks with the default operator `=`, as in v0.3.x.

### Upgrade steps

1. **Import** `template.dist.yaml` of the new release with the default import rules, as in the
   [Quick start](#-quick-start). On hosts that still have the old value, all three discovery rules stop with the error
   above and change nothing: the items and triggers of v0.3.x stay as they are and keep working.
2. **Convert** `{$PUSHIT.WEBCHECK.CONFIG}` on every host. You can also do this before the import: v0.3.x stops on the
   new format in the same way and changes nothing either.
3. **Run discovery**: click *Execute now* on the three discovery rules of every host and check that none of them is
   *Not supported*.
4. **Only then** rename entries, change URLs, merge entries such as v0.3.x's `shop-frontend` and `shop-cert` of the
   same URL into one, or turn a `json_text` check into a `json_number` check. Each of these creates new items for the
   checks concerned and disables the old ones, which are deleted with their history 7 days later. Kept out of the
   conversion, they leave the first run with nothing to do but rename, and you can check that every entry kept its
   items.

The first successful discovery run renames the following objects in place. They keep their ids, their history and
their open problems; open problems keep the name they were raised with until they are resolved.

| v0.3.x | Now |
|---|---|
| Item `JSON path {#NAME}`, key `pushit.webcheck.http.json_path["{#URL}#{#NAME}"]` | `JSON path (text) {#NAME}`, key `pushit.webcheck.http.json_path_text["{#URL}#{#NAME}"]` |
| Trigger `Unexpected JSON value for {#NAME}` | `JSON value for {#NAME} does not match expected value (text)` |
| Trigger `No JSON value for {#NAME}` | `No JSON value for {#NAME} (text)` |
| Trigger `No data for JSON path {#NAME}` | `No data for JSON path (text) {#NAME}` |
| Triggers `Certificate for {#NAME} will expire in N days or less` | The same names followed by `(WARN)`, `(AVERAGE)` or `(HIGH)` |

All other items and triggers keep their names and keys. Update whatever refers to the old key or names: calculated
items and expression macros that use `pushit.webcheck.http.json_path[...]`, conditions of actions that match trigger
names, and API scripts. The new **Performance** rule creates nothing until an entry gets a `performance` key.

**Entries that shared a URL in v0.2.x** can still have their checks on the raw item of the last of them, if you came
to v0.3.x from v0.2.x. Once that entry is removed, renamed or gets a new URL, the others report **No data for ...**.
Delete the disabled **Response {#NAME}** or **Certificate data {#NAME}** item with the old URL and click
*Execute now*: the checks are created again on the entry's own raw item.

## 🔢 Macros

All macros are defined on the template and can be overridden per host. Time values are Zabbix time expressions such as
`30s`, `5m`, `1h` or `2d`.

| Macro | Default | Used by | Purpose |
|---|---|---|---|
| `{$PUSHIT.WEBCHECK.CONFIG}` | `{}` | discovery rules | The endpoint configuration, a JSON object with one property per endpoint. Set this on every host. |
| `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` | `1m` | `expectStatus`, `json_text`, `json_number`, `performance` | Update interval of the raw item **Response {#NAME}** and of **HTTP performance {#NAME}**. |
| `{$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}` | `3m` | `expectStatus` | How long a missing status code is tolerated before **No status code for {#NAME}** (HIGH) fires, and how long missing data is tolerated before **No data for HTTP status {#NAME}** (WARNING) fires. Must be larger than `HTTP.INTERVAL`, otherwise it provides no tolerance and can raise false no-data problems. |
| `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}` | `3m` | `json_text`, `json_number` | How long a missing JSON value is tolerated before **No JSON value for {#NAME} (text)** or **(number)** (HIGH) fires, and how long missing data is tolerated before **No data for JSON path (text) {#NAME}** or **No data for JSON path (number) {#NAME}** (WARNING) fires. Must be larger than `HTTP.INTERVAL`, otherwise it provides no tolerance and can raise false no-data problems. |
| `{$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}` | `15m` | `certificate` | Update interval of the raw item **Certificate data {#NAME}**. |
| `{$PUSHIT.WEBCHECK.CERTIFICATE.NO_DATA_GRACE}` | `30m` | `certificate` | How long missing certificate data is tolerated before **Certificate data for {#NAME} is unavailable** (INFO) fires. Must be larger than `CERTIFICATE.INTERVAL` and smaller than `CERTIFICATE.HISTORY`. |
| `{$PUSHIT.WEBCHECK.CERTIFICATE.HISTORY}` | `90m` | `certificate` | History retention of the raw certificate JSON only. Must be larger than `CERTIFICATE.NO_DATA_GRACE`, should be larger than `CERTIFICATE.INTERVAL` and must be at least `1h`. The derived items are not affected. |

The grace period of a performance check is not a macro but the `nodata` key of its entry.

### Keep the timing consistent

Timing at a glance, with the default values:

| Check | Raw item collected every | Grace period | Raw history kept for |
|---|---|---|---|
| `expectStatus` | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` = 1m | `{$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}` = 3m | never |
| `json_text`, `json_number` | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` = 1m | `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}` = 3m | never |
| `performance` | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` = 1m | `performance.nodata` (required per entry) | 31d (Zabbix default) |
| `certificate` | `{$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}` = 15m | `{$PUSHIT.WEBCHECK.CERTIFICATE.NO_DATA_GRACE}` = 30m | `{$PUSHIT.WEBCHECK.CERTIFICATE.HISTORY}` = 90m |

Two rules follow from this:

- **Grace periods must be larger than the interval.** The grace period is the time window of `nodata()` and of
  `count()` in the triggers. If it is equal to or shorter than the interval, the window runs out between two regular
  polls: the no-data triggers can raise problems on a healthy endpoint, and a single failed request is enough for
  **No status code** or **No JSON value**. The defaults (1m interval, 3m grace) tolerate two missed polls.
- **`CERTIFICATE.INTERVAL < CERTIFICATE.NO_DATA_GRACE < CERTIFICATE.HISTORY`.** The certificate `nodata()` trigger
  watches the raw item **Certificate data {#NAME}**, whose history is set by `CERTIFICATE.HISTORY`, so the history
  has to outlast the grace period. When you raise one, raise the other with it. The HTTP triggers watch the
  dependent items and the performance triggers their own item, which keep the Zabbix default history of 31d, so no
  such rule applies to them.

An agent that cannot be reached sends neither responses nor errors. The HTTP checks of the host then raise only their
WARNING **No data for ...** triggers, one per check, after the grace period, and the performance checks their WARNING
**Missing HTTP performance data for {#NAME}** after `nodata`. A host that is down looks the same to Zabbix, so services
running on it are then reported only as WARNING as well; monitor the availability of such hosts with the severity you
need, for example with the agent availability trigger of the host's OS template or with an ICMP ping check.
**Unexpected status code**, the JSON comparison triggers, **No status code**, **No JSON value** and the performance
thresholds keep their state until data arrives again. If no successful request lies within the grace period, as for a
new entry or after an agent outage longer than the grace period, the first failed request raises **No status code** or
**No JSON value** right away.

To get only the agent problem in that case, make the trigger prototypes **No data for HTTP status {#NAME}**,
**No data for JSON path (text) {#NAME}** and **No data for JSON path (number) {#NAME}** depend on the agent availability
trigger of the host's OS template, for example **Linux: Zabbix agent is not available**: in the row of the host under
*Data collection → Hosts*, click *Discovery*, then *Trigger prototypes* of the **HTTP** rule, and add the trigger on the
*Dependencies* tab of each of these prototypes. Do the same for **Missing HTTP performance data for {#NAME}** in the
**Performance** rule. Discovery passes the dependency on to the triggers of every check, and updates of this template
keep it. A dependency only holds back problems that start after the agent problem. With the default `{$AGENT.TIMEOUT}`
of `3m` the agent problem usually comes after the `3m` grace period, so also lower `{$AGENT.TIMEOUT}` on the host, for
example to `1m`.

## 📦 Items and triggers

Every discovered object carries the name of its entry, so items and triggers of different services never collide and
are easy to tell apart in *Latest data* and *Problems*.

| Discovery rule | Key | Type | Runs | Accepts entries with | Lost resources |
|---|---|---|---|---|---|
| **HTTP** | `pushit.webcheck.discovery.http` | Script | every 10m | `expectStatus`, `json_text` or `json_number` | Disable immediately, delete after 7d |
| **Certificate** | `pushit.webcheck.discovery.certificate` | Script | every 10m | `certificate` | Disable immediately, delete after 7d |
| **Performance** | `pushit.webcheck.discovery.performance` | Script | every 10m | `performance` | Disable immediately, delete after 7d |

All three rules receive `{$PUSHIT.WEBCHECK.CONFIG}` as the script parameter `config` and run the same script. It
parses the value, checks every entry against the rules in [Endpoint configuration](#-endpoint-configuration) and
returns one row per entry with the LLD macros below. On the first problem it throws an error instead: all three rules
become *Not supported* and the discovered items stay as they are.

| LLD macro | Value |
|---|---|
| `{#NAME}`, `{#URL}` | The name of the entry and its `url` |
| `{#TYPES}` | The checks of the entry, comma-separated: `http_status`, `json_path_text`, `json_path_number`, `certificate` and `http_performance` for the keys `expectStatus`, `json_text`, `json_number`, `certificate` and `performance` |
| `{#EXPECT_STATUS}` | `expectStatus` |
| `{#JSON_PATH_TEXT}`, `{#EXPECT_VALUE_TEXT}`, `{#JSON_OPERATOR_TEXT}` | `path`, `expect` and `operator` (default `=`) of `json_text`; the operator is empty for entries without `json_text` |
| `{#JSON_PATH_NUMBER}`, `{#EXPECT_VALUE_NUMBER}`, `{#JSON_OPERATOR_NUMBER}` | The same for `json_number`; the expected value is normalized to a number, so `"1.50"` becomes `1.5`, and very small or very large values get an exponent, such as `1e-7` |
| `{#CERT_WARN_DAYS}`, `{#CERT_AVG_DAYS}`, `{#CERT_HIGH_DAYS}` | `warning`, `average` and `high` of `certificate`, `-1` for a level that is omitted |
| `{#PERF_NODATA}` | `nodata` of `performance` |
| `{#PERF_WARN}`, `{#PERF_AVG}`, `{#PERF_HIGH}`, `{#PERF_DISASTER}` | `warning`, `average`, `high` and `disaster` of `performance`, `-1` for a level that is omitted |
| `{#PERF_TIMEOUT}` | The timeout of **HTTP performance {#NAME}**, such as `6s`, see [Checking HTTP performance](#checking-http-performance) |

The **HTTP** rule creates its dependent item prototypes and its comparison trigger prototypes with *Discover* set to
*No* and switches on the matching ones with overrides, so each HTTP entry ends up with the raw item plus the dependent
items of its checks, and with the comparison trigger of each configured operator:

| Override | Condition | Effect |
|---|---|---|
| Enable http_status | `{#TYPES}` contains `http_status` | Item prototypes whose name matches `^HTTP status.*$` are discovered |
| Enable json_path_text | `{#TYPES}` contains `json_path_text` | Item prototypes whose name matches `^JSON path \(text\).*$` are discovered. A second operation with `^JSON path [^(].*$` matches only the name `JSON path {#NAME}` of v0.3.x items, so that an update renames them in place. |
| Enable json_path_number | `{#TYPES}` contains `json_path_number` | Item prototypes whose name matches `^JSON path \(number\).*$` are discovered: **JSON path (number) {#NAME}** and **JSON path (number) readable {#NAME}** |
| Enable json_text EQUALS assertion | `{#JSON_OPERATOR_TEXT}` is `=` | **JSON value for {#NAME} does not match expected value (text)** is discovered |
| Enable json_text NOT EQUALS assertion | `{#JSON_OPERATOR_TEXT}` is `<>` | **JSON value for {#NAME} matches prohibited value (text)** is discovered |
| Enable json_number EQUALS assertion | `{#JSON_OPERATOR_NUMBER}` is `=` | **JSON value for {#NAME} does not match expected value (number)** is discovered |
| Enable json_number NOT EQUALS assertion | `{#JSON_OPERATOR_NUMBER}` is `<>` | **JSON value for {#NAME} matches prohibited value (number)** is discovered |
| Enable json_number LESS THAN assertion | `{#JSON_OPERATOR_NUMBER}` is `<` | **JSON value for {#NAME} is not below expected limit (number)** is discovered |
| Enable json_number LESS THAN OR EQUALS assertion | `{#JSON_OPERATOR_NUMBER}` is `<=` | **JSON value for {#NAME} exceeds expected maximum (number)** is discovered |
| Enable json_number GREATER THAN assertion | `{#JSON_OPERATOR_NUMBER}` is `>` | **JSON value for {#NAME} is not above expected limit (number)** is discovered |
| Enable json_number GREATER THAN OR EQUALS assertion | `{#JSON_OPERATOR_NUMBER}` is `>=` | **JSON value for {#NAME} is below expected minimum (number)** is discovered |

The **Certificate** and **Performance** rules work the other way round: their trigger prototypes are discovered, and
the overrides *Undiscover WARN trigger*, *Undiscover AVG trigger*, *Undiscover HIGH trigger* and, in the Performance
rule, *Undiscover DISASTER trigger* leave out the trigger of a level whose LLD macro is `-1`.

<details>
<summary><strong>HTTP status</strong>: items and triggers</summary>

| Item | Key | Type | Value type | Interval | History |
|---|---|---|---|---|---|
| Response {#NAME} | `web.page.get["{#URL}#{#NAME}"]` | Zabbix agent | Text | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` | none |
| HTTP status {#NAME} | `pushit.webcheck.http.status["{#URL}#{#NAME}"]` | Dependent on Response {#NAME} | Numeric (unsigned) | with the master item | 31d (Zabbix default) |

**Response {#NAME}** fetches the raw response (status line, headers and body) but does not store it. Unlike agent 2, the
classic Zabbix agent can put further header blocks in front of it: those of interim responses such as `103 Early Hints`,
and the reply of a proxy to `CONNECT` when `https_proxy` is set in the agent's environment. **HTTP status {#NAME}**
has two preprocessing steps: a *Check for not supported value* step (see below), then a *Regular expression* step
with the output `\1` and the pattern below, which skips every header block that is directly followed by another
status line and extracts the three-digit status code of the final response.

```text
\A(?:HTTP/[^\n]*\n(?:[^\r\n][^\n]*\n)*\r?\n(?=HTTP/))*HTTP/[0-9.]+[ \t]+([0-9]{3})(?:[ \t]|\r?\n|$)
```

| Trigger | Severity | Condition |
|---|---|---|
| Unexpected status code for {#NAME} | HIGH | The last code is neither `0` nor `{#EXPECT_STATUS}`. The problem stays open until `{#EXPECT_STATUS}` arrives again or **No status code for {#NAME}** fires and takes over. |
| No status code for {#NAME} | HIGH | The last code is `0` and no other code has arrived within the last `{$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}`. |
| No data for HTTP status {#NAME} | WARNING | No value at all, not even `0`, for `{$PUSHIT.WEBCHECK.HTTP_STATUS.NO_STATUS_GRACE}`, usually because the agent is not reachable. |

`0` stands for "no status code". When the agent cannot fetch the URL, because the connection is refused, the request
times out or the answer is not HTTP, it reports an error and **Response {#NAME}** becomes *Not supported*. A *Check
for not supported value* step in front of the regular expression turns that error into `0`, and *Custom on fail* on
the regular expression does the same for a response without a valid status line. **HTTP status {#NAME}** therefore
stays supported and gets a value on every poll that reaches the agent, but it does not keep the reason for a `0`. A
failed request shows its error on **Response {#NAME}**. For a response without a valid status line, get the raw value
as in the tip **Test a check by hand** and paste it into *Test* on **HTTP status {#NAME}**, which shows the result of
every preprocessing step. Paste only the value: the output of `zabbix_get`, or the output of `-t` without the key, the
`[s|` or `[t|` in front and the `]` at the end.

</details>

<details>
<summary><strong>JSON path (text)</strong>: items and triggers</summary>

| Item | Key | Type | Value type | Interval | History |
|---|---|---|---|---|---|
| Response {#NAME} | `web.page.get["{#URL}#{#NAME}"]` | Zabbix agent | Text | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` | none |
| JSON path (text) {#NAME} | `pushit.webcheck.http.json_path_text["{#URL}#{#NAME}"]` | Dependent on Response {#NAME} | Text | with the master item | 31d (Zabbix default) |

**Response {#NAME}** is the same raw item as for the HTTP status check. **JSON path (text) {#NAME}** has three
preprocessing steps: a *Check for not supported value* step (see below), a *Regular expression* step with the output
`\1` and the pattern below, which drops all header blocks and anything in front of the first `{` or `[` of the body,
such as a byte order mark, then a *JSONPath* step that applies `{#JSON_PATH_TEXT}`.

```text
\A(?:HTTP/[^\n]*\n(?:[^\r\n][^\n]*\n)*\r?\n(?=HTTP/))*HTTP/[^\n]*\n(?:[^\r\n][^\n]*\n)*\r?\n[^{\[]*([\s\S]*)
```

| Trigger | Severity | Condition |
|---|---|---|
| JSON value for {#NAME} does not match expected value (text) | HIGH | Discovered for `operator` `=` (default). The last value is neither `[no value]` nor `{#EXPECT_VALUE_TEXT}`. The problem stays open until `{#EXPECT_VALUE_TEXT}` arrives again or **No JSON value for {#NAME} (text)** fires and takes over. |
| JSON value for {#NAME} matches prohibited value (text) | HIGH | Discovered for `operator` `<>`. The last value is `{#EXPECT_VALUE_TEXT}`. The problem stays open until a value other than `{#EXPECT_VALUE_TEXT}` and `[no value]` arrives or **No JSON value for {#NAME} (text)** fires and takes over. |
| No JSON value for {#NAME} (text) | HIGH | The last value is `[no value]` and no other value has arrived within the last `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}`. |
| No data for JSON path (text) {#NAME} | WARNING | No value at all, not even `[no value]`, for `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}`, usually because the agent is not reachable. |

`[no value]` stands for "no value at the path". A *Check for not supported value* step in front of the regular
expression and *Custom on fail* on the *Regular expression* and *JSONPath* steps store it instead of an error when the
agent cannot fetch the URL, the response has no body, the body is not JSON or `{#JSON_PATH_TEXT}` matches nothing. As
for the HTTP status check, the reason is not kept: a failed request shows its error on **Response {#NAME}**, and for
the other cases *Test* on **JSON path (text) {#NAME}** with the raw value from the tip **Test a check by hand**,
pasted the same way, shows which step fails.

</details>

<details>
<summary><strong>JSON path (number)</strong>: items and triggers</summary>

| Item | Key | Type | Value type | Interval | History |
|---|---|---|---|---|---|
| Response {#NAME} | `web.page.get["{#URL}#{#NAME}"]` | Zabbix agent | Text | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` | none |
| JSON path (number) {#NAME} | `pushit.webcheck.http.json_path_number["{#URL}#{#NAME}"]` | Dependent on Response {#NAME} | Numeric (float) | with the master item | 31d (Zabbix default) |
| JSON path (number) readable {#NAME} | `pushit.webcheck.http.json_path_number.readable["{#URL}#{#NAME}"]` | Dependent on Response {#NAME} | Numeric (unsigned), `1` or `0` | with the master item | 31d (Zabbix default) |

**JSON path (number) {#NAME}** holds the number, so it can be graphed. It has two preprocessing steps: the same
*Regular expression* step as **JSON path (text) {#NAME}**, then a *JSONPath* step that applies `{#JSON_PATH_NUMBER}`.
It has no error handling and stores nothing but numbers: when no number can be read, it becomes *Not supported* and
shows the reason as its error, for example the error of a failed request or
`Value of type "string" is not suitable for value type "Numeric (float)". Value "n/a"`.

**JSON path (number) readable {#NAME}** tells the triggers whether a number could be read: `1` if it could, `0` if the
request failed, the body is not JSON, the path matches nothing or the value there is not a number. It has four
preprocessing steps. The first three are those of **JSON path (text) {#NAME}**, with `{#JSON_PATH_NUMBER}` in the
*JSONPath* step: *Check for not supported value*, *Regular expression* and *JSONPath*, each with *Custom on fail*
`[no value]`. The last is a *Regular expression* step with the output `1`, *Custom on fail* `0` and the pattern below.
It accepts what Zabbix
accepts for a float item: a decimal number with optional sign, fraction and exponent, optionally in double quotes and
with spaces around it. The only exception is a number beyond the range of a float, such as `1e400`: then the readable
item is `1` while **JSON path (number) {#NAME}** is *Not supported*, and the comparison trigger turns *Unknown*, so
no problem is raised as long as the endpoint returns such a value.

```text
\A *("?)[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\1 *[\r\n]*\z
```

| Trigger | Severity | Condition |
|---|---|---|
| JSON value for {#NAME} does not match expected value (number) | HIGH | Discovered for `operator` `=` (default). The last number differs from `{#EXPECT_VALUE_NUMBER}`. |
| JSON value for {#NAME} matches prohibited value (number) | HIGH | Discovered for `operator` `<>`. The last number equals `{#EXPECT_VALUE_NUMBER}`. |
| JSON value for {#NAME} is not below expected limit (number) | HIGH | Discovered for `operator` `<`. The last number is greater than or equal to `{#EXPECT_VALUE_NUMBER}`. |
| JSON value for {#NAME} exceeds expected maximum (number) | HIGH | Discovered for `operator` `<=`. The last number is greater than `{#EXPECT_VALUE_NUMBER}`. |
| JSON value for {#NAME} is not above expected limit (number) | HIGH | Discovered for `operator` `>`. The last number is less than or equal to `{#EXPECT_VALUE_NUMBER}`. |
| JSON value for {#NAME} is below expected minimum (number) | HIGH | Discovered for `operator` `>=`. The last number is less than `{#EXPECT_VALUE_NUMBER}`. |
| No JSON value for {#NAME} (number) | HIGH | The last readable value is `0` and no `1` has arrived within the last `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}`. |
| No data for JSON path (number) {#NAME} | WARNING | No readable value at all, not even `0`, for `{$PUSHIT.WEBCHECK.JSON_PATH.NO_RESPONSE_GRACE}`, usually because the agent is not reachable. |

The six comparison triggers fire only while the last readable value is `1`. Each stays open until a number arrives
that satisfies the comparison, or until **No JSON value for {#NAME} (number)** fires and takes over. They use both
items, so they are trigger prototypes of the **HTTP** rule itself, not of an item prototype.

</details>

<details>
<summary><strong>HTTP performance</strong>: items and triggers</summary>

The **Performance** rule discovers entries containing `performance` and creates one collecting item and up to five
triggers.

| Item | Key | Type | Value type | Interval | Timeout | History |
|---|---|---|---|---|---|---|
| HTTP performance {#NAME} | `web.page.perf["{#URL}#{#NAME}"]` | Zabbix agent | Numeric (float), seconds | `{$PUSHIT.WEBCHECK.HTTP.INTERVAL}` | `{#PERF_TIMEOUT}` | 31d (Zabbix default) |

| Trigger | Severity | Condition |
|---|---|---|
| Missing HTTP performance data for {#NAME} | WARNING | No value for `performance.nodata` (`{#PERF_NODATA}`). |
| Performance of {#NAME} exceeds WARN limit | WARNING | Last load time `> performance.warning` (`{#PERF_WARN}`). |
| Performance of {#NAME} exceeds AVERAGE limit | AVERAGE | Last load time `> performance.average` (`{#PERF_AVG}`). |
| Performance of {#NAME} exceeds HIGH limit | HIGH | Last load time `> performance.high` (`{#PERF_HIGH}`). |
| Performance of {#NAME} exceeds DISASTER limit | DISASTER | Last load time `> performance.disaster` (`{#PERF_DISASTER}`). |

With the example limits of `0.5`, `1`, `2` and `5` seconds, a load time of `0.8` raises WARNING, `1.5` raises WARNING and
AVERAGE, and `5.2` raises all four threshold problems. A page slower than `{#PERF_TIMEOUT}` (`6s` with these limits) or
a failed request gives no load time: the item becomes *Not supported*, the threshold triggers turn *Unknown* and keep
their value, and **Missing HTTP performance data for {#NAME}** raises a WARNING after `nodata`.

</details>

<details>
<summary><strong>Certificate</strong>: items and triggers</summary>

| Item | Key | Type | Value type | Interval | History |
|---|---|---|---|---|---|
| Certificate data {#NAME} | `web.certificate.get["{#URL}#{#NAME}"]` | Zabbix agent (agent 2) | Text | `{$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}` | `{$PUSHIT.WEBCHECK.CERTIFICATE.HISTORY}` |
| Certificate expiration {#NAME} | `pushit.webcheck.certificate.not_after["{#URL}#{#NAME}"]` | Dependent on Certificate data {#NAME} | Numeric (unsigned), unit `unixtime` | with the master item | 31d (Zabbix default) |
| Certificate validity {#NAME} | `pushit.webcheck.certificate.is_valid["{#URL}#{#NAME}"]` | Dependent on Certificate data {#NAME} | Text | with the master item | 31d (Zabbix default) |
| Days until certificate expires ({#NAME}) | `pushit.webcheck.certificate.days_until_expiration["{#URL}#{#NAME}"]` | Dependent on Certificate data {#NAME} | Numeric (float), unit `!days` | with the master item | 31d (Zabbix default) |

**Certificate data {#NAME}** holds the raw certificate JSON. **Certificate expiration {#NAME}** takes
`$.x509.not_after.timestamp` from it (the *notAfter* date as a Unix timestamp), **Certificate validity {#NAME}**
takes `$.result.value` (`valid`, `invalid` or `valid-but-self-signed`), and **Days until certificate expires
({#NAME})** takes the same `$.x509.not_after.timestamp` and turns it into the remaining days, rounded to one decimal,
with a second, *JavaScript* preprocessing step: `return Math.round((value - Date.now() / 1000) / 86400 * 10) / 10;`.
The `!` in its unit stops Zabbix from showing 1000 days or more with a prefix, such as `1.1 Kdays` for 1100 days.

| Trigger | Severity | Condition |
|---|---|---|
| Certificate data for {#NAME} is unavailable | INFO | No certificate data for `{$PUSHIT.WEBCHECK.CERTIFICATE.NO_DATA_GRACE}`. |
| Certificate for {#NAME} is invalid | HIGH | The validity value is anything other than `valid`. |
| Certificate for {#NAME} will expire in {#CERT_WARN_DAYS} days or less (WARN) | WARNING | Days until expiry `<= certificate.warning` (`{#CERT_WARN_DAYS}`). |
| Certificate for {#NAME} will expire in {#CERT_AVG_DAYS} days or less (AVERAGE) | AVERAGE | Days until expiry `<= certificate.average` (`{#CERT_AVG_DAYS}`). |
| Certificate for {#NAME} will expire in {#CERT_HIGH_DAYS} days or less (HIGH) | HIGH | Days until expiry `<= certificate.high` (`{#CERT_HIGH_DAYS}`). |

The three expiry triggers are independent of each other: once the days drop to the HIGH threshold, all three are
in problem state. The suffix keeps their names apart when two levels have the same number of days.

</details>

## 💡 Tips and gotchas

- **Renaming an entry or changing its URL recreates it.** The name and the `url` are part of every item key of the
  entry, so the next discovery run creates a new set of items and triggers for it and disables the old set. The new
  set starts without history, and checks you paused by hand are active again. Problems of the old set disappear from
  *Problems*, and the old set is deleted with its history 7 days later. Changing the expected values, a JSON path or
  the thresholds of an entry updates its items and triggers in place, with their history. A new `operator` replaces
  the comparison trigger, and a check taken out of an entry or a level set to `-1` removes its items or its trigger.
  The replaced or removed objects are handled like those of a removed entry: disabled, and deleted 7 days later.
- **Plain requests from the agent.** `web.page.get` and `web.page.perf` send a plain `GET` request without custom
  headers or body, and without credentials unless the URL contains them (see **Keep credentials out of the `url`**),
  so point HTTP checks at endpoints that answer anonymously. To verify that a protected endpoint is up, use
  `expectStatus` `"401"`. The requests, and the TLS connections of certificate checks, originate on the monitored
  host: firewalls between the agent and the service matter, firewalls between the Zabbix server and the service do not.
- **Certificate checks need `https` and Zabbix agent 2.** For obvious reasons, `web.certificate.get` accepts only the
  `https` scheme. For less obvious reasons it exists only in agent 2. On a host with the classic agent,
  **Certificate data {#NAME}** becomes *Not supported* and an INFO-level problem will be triggered after 30 minutes.
- **`https` in HTTP checks needs cURL in the classic agent.** The classic Zabbix agent must be built with cURL
  support to fetch `https` URLs with `web.page.get` or `web.page.perf`, otherwise the item becomes *Not supported*.
  Zabbix agent 2 has no such requirement.
- **Point certificate checks at the certificate's name.** The certificate is validated for the host name in the
  URL, so `https://shop.example.com` reports `valid` where `https://localhost` reports `invalid` for the same
  certificate. Self-signed certificates yield `valid-but-self-signed`, which also fires **Certificate for {#NAME}
  is invalid**.
- **Removed entries are disabled, then deleted.** An entry taken out of the macro has its items and triggers disabled on
  the next discovery run and deleted with their history 7 days later. Until then a slip in the macro can be undone: put
  the entry back and the same items return with their history. To pause a check instead, see the next tip.
- **Pausing a check.** Pause a single check by disabling its triggers on the host or its items: **HTTP status
  {#NAME}**, **JSON path (text) {#NAME}**, both **JSON path (number) {#NAME}** and **JSON path (number) readable
  {#NAME}**, or **HTTP performance {#NAME}**. Pause a whole host with a maintenance period. Never disable the raw item
  **Response {#NAME}** or **Certificate data {#NAME}** on its own: the HTTP checks of the entry then raise their
  **No data for ...** triggers (WARNING) after the grace period although the endpoint is fine, and a certificate check
  silently freezes: validity and days keep their last values and its triggers neither raise nor resolve problems,
  because its nodata trigger watches the disabled item itself. Disabling does not close an open problem: it disappears
  from *Problems* but stays open until you enable the trigger or item again and the check recovers.
- **Raw items disabled by hand outlive their entry.** Discovery never deletes a raw item (**Response {#NAME}**,
  **Certificate data {#NAME}** or **HTTP performance {#NAME}**) that was disabled by hand: it stays on the host when its
  entry is removed, renamed or given a new URL, and a later entry with the same raw item key takes it over, still
  disabled. Enable the item again before you do that, or delete it afterwards.
- **An invalid configuration stops discovery.** All three discovery rules turn *Not supported* when the macro is not
  valid JSON or not a JSON object, uses the list format of v0.3.x (see [Migration](#-migration-from-v03x)), or has an
  entry that breaks one of these rules:
  - the entry is a JSON object, its name consists of Latin letters, digits, `_`, `-` and `.`, and no other entry has
    the same name;
  - only known keys, at every level: a typo such as `json-text`, or `warn` in `certificate`, names the key and the
    allowed keys;
  - `url` is a non-empty string, and the entry has at least one check; `json_text`, `json_number`, `certificate` and
    `performance` are JSON objects;
  - `expectStatus` is a status code from 100 to 599 or a user macro;
  - `path` is a JSONPath without `"` and without spaces outside brackets, or one with a user macro;
  - `expect` of `json_text` is a string without leading or trailing spaces, a number, a boolean or `null`, `expect`
    of `json_number` a decimal number or a user macro;
  - `operator` is `=` or `<>` for `json_text`, and `=`, `<>`, `<`, `<=`, `>` or `>=` for `json_number`;
  - certificate levels are numbers or user macros, not for example `"30d"`;
  - `performance` has a `nodata` that is a time period such as `"3m"` or a user macro, and its levels are numbers
    from `0` to below `600`, or `-1`.

  Their *Info* column shows an error that names the entry, for example
  `Cannot execute script: Entry "app": json_number.expect must be a number such as 10 or -2.5, or a user macro, got "forty"`.
  Existing items stay as they are and keep collecting, but discovery creates, changes and deletes nothing on the host
  until the macro is fixed, not even the changes that come with a new version of this template. Zabbix raises no
  problem for this; to get a message, enable the internal action *Report not supported low level discovery rules*
  under *Alerts → Actions → Internal actions*, which is disabled by default.
- **Errors in JSONPath filters do not stop discovery.** The rules check a JSON path only up to its first filter
  expression such as `[?(@.status == 'UP')]`. Zabbix checks the rest when it creates the item and reports an error only
  in the *Info* column of the **HTTP** rule, which stays normal. The entry is left without a working JSON check.
- **Values with user macros are not checked.** `expectStatus`, the `path` and `expect` of the JSON checks, the
  certificate levels and `performance.nodata` may contain user macros, for example `"expectStatus":"{$APP.STATUS}"` or
  `"path":"$.{$APP.KEY}"`. Zabbix resolves them only when it evaluates the check, so the rules only make sure that such
  a value has no spaces at its ends and that a JSON path contains no `"` and starts with `$` or with a macro. A
  misspelled or undefined macro leaves the trigger in the *Unknown* state, so it never fires; so does a certificate
  level that is not a plain number, such as `7d`. A status code or a `json_number` value that is not a number, such as
  `2xx` or `forty`, is compared as text: **Unexpected status code for {#NAME}** and the `=` comparison of `json_number`
  then fire on every value, `<>` never fires, and `<`, `<=`, `>` and `>=` stay *Unknown*. In a JSON path, a wrong or
  undefined macro raises **No JSON value for {#NAME} (text)** or **(number)**. The performance levels cannot be user
  macros, because the timeout of the item is computed from them.
- **The macro value is limited to 2048 characters.** Keep the JSON compact and the names and URLs short. Depending
  on URL length, somewhere between a dozen and twenty entries fit into one macro. Count the characters as shown in
  [compact form](#compact-form).
- **Missing certificate data is only INFO.** The nodata trigger of the raw certificate item has severity INFO, but it
  is the only certificate trigger that notices when no data arrives: the validity and expiry triggers then neither
  raise nor resolve problems, even if the certificate expires in the meantime (see the next tip). If you want it
  louder, raise the severity of the trigger prototype **Certificate data for {#NAME} is unavailable** after import.
- **The days value follows the certificate data.** **Days until certificate expires ({#NAME})** is recalculated
  every time **Certificate data {#NAME}** is fetched, so after a renewal the expiry problems resolve with the next
  fetch, at most `{$PUSHIT.WEBCHECK.CERTIFICATE.INTERVAL}` later. Click **Execute now** on the item to fetch the
  certificate right away. Without new data the value does not count down: if a fetch fails, the item is
  *Not supported*, and while the agent is unreachable it keeps its last value. In both cases the expiry triggers
  neither raise nor resolve problems until the next successful fetch. **Certificate data for {#NAME} is unavailable**
  reports the gap once it lasts longer than `{$PUSHIT.WEBCHECK.CERTIFICATE.NO_DATA_GRACE}`.
- **Slow endpoints and the item timeout.** The items of the HTTP and Certificate rules set no timeout of their own, so
  the global timeout for Zabbix agent items (default 3 seconds, *Administration → General → Timeouts*) or the proxy's
  timeout applies. Raise it if a health endpoint needs longer than that. **HTTP performance {#NAME}** is the
  exception: its timeout is computed from its thresholds (see [Checking HTTP performance](#checking-http-performance)),
  so the global timeout does not apply to it, and a page that is slower than that timeout only raises
  **Missing HTTP performance data for {#NAME}** (WARNING). Agents older than 7.0 ignore item timeouts and give up on a
  request only after their own `Timeout` setting. If that is longer than the item timeout, the server stops waiting
  first and the check gets no value at all: an endpoint that accepts the connection but never answers then raises only
  **No data for ...** (WARNING) instead of **No status code** or **No JSON value**. On such agents, keep `Timeout`
  no higher than the item timeout.
- **Agents that restrict item keys.** The keys of the raw items end in `#{#NAME}`, for example
  `web.page.get["http://localhost:8080/health#app"]`, and `AllowKey` and `DenyKey` rules in the agent configuration
  are matched against the whole key. A pattern that ends in `*`, such as `web.page.get[http://localhost:8080/*]`,
  covers that; an exact pattern such as `web.page.get[http://localhost:8080/health]` does not, and the item becomes
  *Not supported* with `Unsupported item key.` (classic agent) or `Unknown metric web.page.get` (agent 2). The same
  applies to `web.page.perf` and `web.certificate.get`. An `Alias` for a raw item has to use the complete key as well.
- **Test a check by hand.** Copy the key of **Response {#NAME}**, **HTTP performance {#NAME}** or **Certificate data
  {#NAME}** and run it on the monitored host with the agent binary, for example
  `zabbix_agent2 -t 'web.page.get["http://localhost:8080/health#app"]'`,
  `zabbix_agent2 -t 'web.page.perf["http://localhost:8080/health#app"]'` or
  `zabbix_agent2 -t 'web.certificate.get["https://www.example.com#www-cert"]'` (`zabbix_agentd -t ...` for the
  classic agent), or from the server with
  `zabbix_get -s <agent address> -k 'web.page.get["http://localhost:8080/health#app"]'`. With the complete key, the
  test is subject to the same `AllowKey` and `DenyKey` rules as the item. `zabbix_get` prints the raw value the
  dependent items work with; `-t` prints the key followed by the value in `[s|...]` (agent 2) or `[t|...]` (classic
  agent). **Response {#NAME}** does not store the value, so this is the way to look at a raw HTTP response.
- **Redirects are not followed.** For a URL that redirects (`http` to `https`, `/` to `/login`, a missing trailing
  slash), both agents return the redirect itself: the HTTP status check gets its status such as `301` or `302`, the
  JSON checks find no JSON, and the performance check measures only the redirect. Use the final URL, or expect the
  redirect status in `expectStatus`.
- **HTTP checks accept any certificate.** `web.page.get` and `web.page.perf` do not verify the certificate, so HTTP
  status, JSON and performance checks on an `https` URL also pass when it is self-signed, expired or issued for another
  name. Add a `certificate` check for that, as in [example 4](#4-a-realistic-host-several-services-all-types).
- **Keep credentials out of the `url`.** Both agents send the user name and password of a URL such as
  `http://user:secret@localhost:8080/health` as Basic authentication, but the URL also ends up in clear text in the
  keys of all items of the entry, in all of its trigger expressions, for certificate checks in the description of the
  HIGH expiry problem, and in the Zabbix server log. Storing `{$PUSHIT.WEBCHECK.CONFIG}` as a secret macro does not
  hide it. Point the checks at endpoints that answer without authentication, or expect `401` from a protected one.
- **Check the discovery rules after every change.** That means every change to the macro and every import of a new
  version of this template: open *Discovery* in the row of the host under *Data collection → Hosts* and look at the
  *Status* and *Info* columns. A mistake that the rules find turns all three of them *Not supported*, see
  **An invalid configuration stops discovery**. A mistake that only Zabbix notices while it creates the items, such as
  an error inside a JSONPath filter, leaves the rules in normal state and shows up only in the *Info* column. Either
  way, the affected checks are missing, incomplete or outdated until the macro is fixed, and no problem is raised.
- **Remove the template with *Unlink and clear*.** A plain *Unlink* leaves the discovery rules and everything they
  created on the host, cut off from the template's macros: depending on which macros the host overrides, items become
  *Not supported* and triggers turn unknown or report problems. *Unlink and clear* removes all of it.

## 🔧 Development

### Requirements

- [make](https://www.gnu.org/software/make/)
- [yq](https://github.com/mikefarah/yq) v4 by Mike Farah; the build uses its `loadstr` function, which other tools
  named `yq` lack
- [jq](https://jqlang.github.io/jq/) and [duk](https://duktape.org/), the command line interpreter of Duktape, for
  `make check-js`
- [yamllint](https://github.com/adrienverge/yamllint)
- A Zabbix server 7.4 you can use for testing

yamllint is packaged for all major operating systems, and installation instructions for manual installation are
available on its GitHub repo. Its configuration is stored in the default, project-local rule file `.yamllint.yaml`.

### Files and make targets

- `template.yaml` is the source of the template, a Zabbix 7.4 YAML export. Instead of the discovery script, the
  `params` of its three discovery rules only throw an error that points to the release (see the
  [Quick start](#-quick-start)). Make every change to the template here.
- `discovery_script.js` is the discovery script that all three rules run.
- `make` builds `template.dist.yaml`: it trims the script and puts it into the `params` of all three rules. That is
  the file users import. It is generated and listed in `.gitignore`, as are the intermediate files
  `.discovery_script.*`, so never commit them.
- `make lint` runs yamllint on `template.yaml` and `template.dist.yaml`.
- `make check-js` runs the trimmed script with `duk` and the content of `config.example.json` as the value of
  `{$PUSHIT.WEBCHECK.CONFIG}`, so that a syntax error, or a mistake that the trimming introduces, shows up before the
  import. It fails when `config.example.json` is missing or not valid JSON. Line numbers in the errors of `duk` refer
  to `.discovery_script.check.js`.
- `make test` runs the trimmed script with `duk` on every configuration in `tests/cases.json` and fails if one of
  them is not accepted or rejected as its `expect` says. When you change what the script accepts, add a case there.
- `DUK=<interpreter>` runs `check-js` and `test` with another interpreter than `duk`.

GitHub Actions run `make`, `make lint`, `make check-js` and `make test` on every pull request and on every push to
`master` (`.github/workflows/ci.yml`).

Zabbix runs the script in Duktape, which supports ECMAScript 5.1 and only a few later features, so keep the script to
ES5: `var`, `function` and no arrow functions or template literals. The trimming removes every line that starts with
`/*`, every line whose first character after leading spaces is `*`, and every line that starts with `// noinspection`
after leading spaces. So write JSDoc blocks at column 0, use `//` comments inside functions, and never begin a line of
code with `*`, for example when you break a long multiplication.

To verify a change functionally, run `make`, import `template.dist.yaml` into a test Zabbix (importing again updates
the existing template), link it to a host with an agent, set a small `{$PUSHIT.WEBCHECK.CONFIG}` and run
**Execute now** on all three discovery rules. Keep the `uuid` values in `template.yaml`: they tie every object to its
counterpart in an existing installation, so re-importing updates instead of duplicating.

### Releasing

1. Move the entries under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to a section for the new version and update
   the links at its end.
2. Change the tag in the link in the description of `{$PUSHIT.WEBCHECK.CONFIG}` in `template.yaml` to the new
   version, so that an installed template points to the README that matches it.
3. Merge these changes, then create the GitHub release with a new tag for the version, such as `vX.Y.Z`, on that
   commit.
4. Publishing the release starts the workflow `.github/workflows/release.yml`. It builds `template.dist.yaml` from the
   tagged commit, lints it and attaches it to the release. The [Quick start](#-quick-start) sends users to the assets
   of the latest release, so check that the file is there. If the workflow failed, fix the cause and start it again
   under *Actions → Release → Run workflow* with the tag.

## 📄 License

Apache License 2.0, see [LICENSE](LICENSE).

[Zabbix JSONPath]: https://www.zabbix.com/documentation/current/en/manual/config/items/preprocessing/jsonpath_functionality
