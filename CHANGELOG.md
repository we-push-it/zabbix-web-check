# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v0.3.0] - 2026-11-05
### Added
- `No status code for {#NAME}` and `No JSON value for {#NAME}` (HIGH) for requests that fail or yield no value
- `No data for HTTP status {#NAME}` and `No data for JSON path {#NAME}` (WARNING) for checks that get no value at all,
  for example while the agent is not reachable
- Both discovery rules check every entry and stop with an error that names the entry
- `{#TYPES}` also takes a JSON array; case and spaces around the check names do not matter
- Unit `unixtime` on `Certificate expiration {#NAME}`

### Changed
- **BC!** All item keys end in `["{#URL}#{#NAME}"]` (before: `["{#URL}"]` for the raw items, `[{#NAME}]` for the
  dependent items), for example `web.page.get["{#URL}#{#NAME}"]` and `pushit.webcheck.http.status["{#URL}#{#NAME}"]`
  - The first discovery run after the update renames the existing items in place, so they keep their ids and history
  - Update everything that refers to the old keys: calculated items, expression macros, API scripts, and `AllowKey`,
    `DenyKey` or `Alias` rules for the raw keys in the agent configuration
  - After the import, run discovery once on every host (*Execute now* on both rules) before you change a `{#URL}`,
    see *Tips and gotchas* in the README
  - Entries that shared a URL in v0.2.x may keep their checks on the raw item of the last of them; the same README tip
    explains how to repair them
- **BC!** Discovery stops with an error on configs that it accepted before (values with user macros are still
  accepted), for example on entries with
  - unknown keys, such as a leftover `{#TYPE}` or a comment
  - unknown check types in `{#TYPES}`, also next to valid ones
  - a `{#NAME}` with characters other than Latin letters, digits, `_`, `-` and `.`, such as a space
  - the same `{#NAME}` in two HTTP entries or in two certificate entries
  - missing values, status codes outside 100 to 599, day thresholds that are not plain numbers such as `30d`, expected
    values with leading or trailing spaces, or JSON paths with `"` or a syntax error
- **BC!** While discovery stops with an error, it changes nothing on the host, not even the changes of this release.
  After the import, check both discovery rules on every host and fix the macro where they are *Not supported*
- **BC!** `Unexpected status code for {#NAME}` and `Unexpected JSON value for {#NAME}` only fire for a wrong value
  - A failed request raises `No status code` or `No JSON value` (HIGH) after the grace period, for a new entry at once
  - An agent that is not reachable raises `No data for ...` (WARNING) instead of `Unexpected ...` (HIGH)
  - `HTTP status {#NAME}` gets `0` and `JSON path {#NAME}` gets `[no value]` when nothing can be read, instead of
    becoming *Not supported*
  - Review actions that match trigger names or severities. After the update, open `Unexpected ...` problems of failing
    checks are replaced by `No status code` or `No JSON value`, and `No data for ...` can fire briefly
- Lost resources are disabled immediately and deleted after 7 days instead of being deleted immediately; an entry put
  back within 7 days returns with its items and history
- `Days until certificate expires ({#NAME})` is a dependent item of `Certificate data {#NAME}` and is recalculated with
  every fetch instead of every 6 hours
- The certificate expiry triggers are named `Certificate for {#NAME} will expire in N days or less`

### Fixed
- Entries that share a URL no longer lose their checks
- A changed `{#URL}` no longer leaves the entry without checks until the next discovery run
- Status code and JSON body are taken from the final response when the classic agent puts interim responses such as
  `103 Early Hints` or the `CONNECT` reply of a proxy in front of it, and a byte order mark before the JSON is ignored
- `Days until certificate expires ({#NAME})` could stay *Not supported* for up to 6 hours after discovery
- `Days until certificate expires ({#NAME})` showed 1000 days or more as `Kdays`
- Wrong and outdated texts in the README and the template

## [v0.2.0] - 2026-09-29
### Changed
- Disable history of raw HTTP responses (dependent items are unaffected by this change)
- **BC!** `{#TYPE}` is now `{#TYPES}` and allows defining multiple checks for the same endpoint

### Fixed
- Description of `CERTIFICATE.NO_DATA_GRACE` documented the wrong severity

## [v0.1.0] - 2026-09-25
### Added
- `http_status` check
- `json_path` check
- `certificate` check

[Unreleased]: https://github.com/we-push-it/zabbix-web-check/compare/v0.3.0...HEAD
[v0.3.0]: https://github.com/we-push-it/zabbix-web-check/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/we-push-it/zabbix-web-check/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/we-push-it/zabbix-web-check/compare/2d2d04f1...v0.1.0
