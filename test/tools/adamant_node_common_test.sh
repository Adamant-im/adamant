#!/usr/bin/env bash
# Behavioral checks for the node install and repair helpers.
# These tests do not install a node, start PostgreSQL, or download a chain image.
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
# shellcheck source=../../tools/lib/adamant_node_common.sh
source "$root/tools/lib/adamant_node_common.sh"

failures=0

pass() {
  printf 'ok  %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1" >&2
  failures=$((failures + 1))
}

expect_ok() {
  local description="$1"
  shift
  if "$@"; then
    pass "$description"
  else
    fail "$description"
  fi
}

expect_fail() {
  local description="$1"
  shift
  if "$@"; then
    fail "$description"
  else
    pass "$description"
  fi
}

expect_eq() {
  local actual="$1"
  local expected="$2"
  local description="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$description"
  else
    printf '  expected: %q\n  actual:   %q\n' "$expected" "$actual" >&2
    fail "$description"
  fi
}

file_mode() {
  local path="$1"

  if stat -c '%a' "$path" >/dev/null 2>&1; then
    stat -c '%a' "$path"
  else
    stat -f '%Lp' "$path"
  fi
}

bash -n tools/lib/adamant_node_common.sh \
  tools/install_node.sh \
  tools/install_node_centos.sh \
  tools/fix_node.sh \
  test/tools/adamant_node_common_test.sh
pass "bash -n"

if (( ADAMANT_SYSTEMD_STOP_TIMEOUT_SEC * 1000 <= ADAMANT_KILL_TIMEOUT_MS )); then
  fail "systemd stop timeout is longer than the PM2 kill timeout"
else
  pass "systemd stop timeout is longer than the PM2 kill timeout"
fi
expect_eq "$ADAMANT_LOGROTATE_INTERVAL" "0 0 1 * *" "monthly log rotation schedule"
if grep -R -n --exclude-dir=node_modules "0 0 0 1 \*" tools test/tools >/dev/null; then
  fail "invalid logrotate schedule is gone"
else
  pass "invalid logrotate schedule is gone"
fi
if grep -n "pm2 start --name" tools/install_node.sh tools/install_node_centos.sh tools/fix_node.sh tools/lib/adamant_node_common.sh >/dev/null; then
  fail "processes are not started with pm2 start --name"
else
  pass "processes are not started with pm2 start --name"
fi
if grep -n "npm ci --omit=dev" tools/lib/adamant_node_common.sh >/dev/null; then
  pass "application dependencies use npm ci"
else
  fail "application dependencies use npm ci"
fi

expect_ok "accept adamant role" adamant_assert_pg_identifier adamant "PostgreSQL role"
expect_ok "accept adamant_main database" adamant_assert_pg_identifier adamant_main "PostgreSQL database"
expect_fail "reject hyphenated identifier" adamant_assert_pg_identifier "adamant-main" "PostgreSQL database"
expect_fail "reject identifier injection" adamant_assert_pg_identifier "adamant;drop" "PostgreSQL role"
expect_fail "reject empty identifier" adamant_assert_pg_identifier "" "PostgreSQL role"
expect_ok "accept node port" adamant_assert_port 36666
expect_fail "reject port 0" adamant_assert_port 0
expect_fail "reject non-numeric port" adamant_assert_port 36666extra

# shellcheck disable=SC2016
sql="$(adamant_render_format_sql 'ALTER ROLE %I WITH LOGIN PASSWORD %L' "'adamant'" "$(adamant_dollar_quote '$(echo pwned)'"'"'secret')")"
# shellcheck disable=SC2016
if [[ "$sql" == *'$(echo pwned)'* && "$sql" == *"secret"* && "$sql" == *'\gexec'* && "$sql" == *'%I'* && "$sql" == *'%L'* ]]; then
  pass "password is passed literally to format()"
else
  printf '%s\n' "$sql" >&2
  fail "password is passed literally to format()"
fi

expect_eq "$(adamant_parse_checksum_text 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  db_backup.sql.gz' db_backup.sql.gz)" \
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  "parse sha256sum output"
expect_eq "$(adamant_parse_checksum_text 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' db_backup.sql.gz)" \
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
  "parse a bare digest"
expect_fail "reject html checksum body" adamant_parse_checksum_text '<!doctype html><html></html>' db_backup.sql.gz
expect_fail "reject mismatched filename" adamant_parse_checksum_text 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other.sql.gz' db_backup.sql.gz

headers="$(printf 'HTTP/2 200\r\nContent-Type: application/octet-stream\r\nContent-Length: 8057675352\r\n\r\n')"
expect_eq "$(printf '%s' "$headers" | adamant_content_length_from_headers)" "8057675352" "read Content-Length"
expect_ok "8 GiB image fits in 20 GiB free" adamant_space_allows_bytes 21474836480 8057675352 "$ADAMANT_IMAGE_MARGIN_BYTES"
expect_fail "image larger than free space is refused" adamant_space_allows_bytes 1000 8057675352 "$ADAMANT_IMAGE_MARGIN_BYTES"
expect_fail "reject arithmetic-overflow boundary" adamant_space_allows_bytes 9223372036854775807 9223372036854775807 1
expect_fail "reject numbers above int64" adamant_space_allows_bytes 9223372036854775807 9223372036854775808 0
expect_ok "space comparison handles decimal padding" adamant_space_allows_bytes 00020 0005 0005

usable_policy="$(printf '%s\n' \
  'postgresql-18:' \
  '  Installed: (none)' \
  '  Candidate: 18.1-1.pgdg24.04+1' \
  '  Version table:' \
  '     18.1-1.pgdg24.04+1 500' \
  '        500 https://apt.postgresql.org/pub/repos/apt noble-pgdg/main amd64 Packages')"
missing_policy="$(printf '%s\n' 'postgresql-18:' '  Installed: (none)' '  Candidate: (none)')"
ubuntu_policy="$(printf '%s\n' 'postgresql:' '  Installed: (none)' '  Candidate: 16.4-1' '        500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages')"
expect_ok "PGDG policy with a candidate is usable" adamant_pgdg_policy_usable "$usable_policy"
expect_fail "missing PGDG candidate is not usable" adamant_pgdg_policy_usable "$missing_policy"
expect_fail "Ubuntu archive candidate is not a PGDG origin" adamant_pgdg_policy_usable "$ubuntu_policy"

expect_fail "online syncing node blocks restart" adamant_loader_block_reason online '{"loaded":true}' 200 '{"syncing":true}' 200
expect_fail "online rebuilding node blocks restart" adamant_loader_block_reason online '{"loaded":false}' 200 '{"syncing":false}' 200
expect_fail "blockchain loading text blocks restart" adamant_loader_block_reason launching '{"success":false,"error":"Blockchain is loading"}' 500 '' 000
expect_fail "closed API blocks restart" adamant_loader_block_reason online '{"success":false,"error":"API access denied"}' 403 '' 403
expect_fail "silent online node blocks restart" adamant_loader_block_reason online '' 000 '' 000
expect_fail "malformed loader JSON blocks restart" \
  adamant_loader_block_reason online '{"loaded":true' 200 '{"syncing":false' 200
expect_fail "missing pm2 cli blocks restart" adamant_loader_block_reason missing-cli '' 000 '' 000
expect_fail "unexpected pm2 state blocks restart" adamant_loader_block_reason "one-launch-status" '' 000 '' 000
expect_ok "idle online node can restart" adamant_loader_block_reason online '{"loaded": true}' 200 '{"syncing": false}' 200
expect_ok "stopped node can start" adamant_loader_block_reason stopped '' 000 '' 000
expect_ok "missing process can start" adamant_loader_block_reason missing '' 000 '' 000
expect_ok "force permits confirmed sync state" \
  adamant_loader_block_reason online '{"loaded":true}' 200 '{"syncing":true}' 200 true
expect_ok "force permits confirmed loading state" \
  adamant_loader_block_reason launching '{"success":false,"error":"Blockchain is loading"}' 500 '' 000 true
expect_fail "force does not permit malformed loader JSON" \
  adamant_loader_block_reason online '{"loaded":true' 200 '{"syncing":false' 200 true
expect_fail "force does not permit unknown PM2 state" \
  adamant_loader_block_reason unknown '' 000 '' 000 true

tmp="$(mktemp -d)"
(
  umask 077
  adamant_install_mode_directory "$tmp/postgresql-common"
  adamant_install_mode_directory "$tmp/postgresql-common/pgdg"
  install -m 0644 /dev/null "$tmp/postgresql-common/pgdg/key.asc"
  mkdir -m 0700 "$tmp/existing"
  adamant_install_mode_directory "$tmp/existing"
)
expect_eq "$(file_mode "$tmp/postgresql-common")" "755" "PGDG parent directory is 0755 under umask 077"
expect_eq "$(file_mode "$tmp/postgresql-common/pgdg")" "755" "PGDG key directory is 0755 under umask 077"
expect_eq "$(file_mode "$tmp/postgresql-common/pgdg/key.asc")" "644" "PGDG key file is 0644 under umask 077"
expect_eq "$(file_mode "$tmp/existing")" "755" "existing directory mode is repaired to 0755"

(
  runuser() {
    printf '%s\n' "$*" >"$tmp/runuser.args"
    cat >"$tmp/streamed.sql"
  }
  adamant_psql_format_gexec psql postgres \
    'ALTER ROLE %I WITH LOGIN PASSWORD %L' \
    "'adamant'" \
    "'secret'"
)
if grep -F -- '-f - postgres' "$tmp/runuser.args" >/dev/null \
  && grep -F -- "ALTER ROLE %I WITH LOGIN PASSWORD %L" "$tmp/streamed.sql" >/dev/null; then
  pass "psql format helper streams SQL over stdin"
else
  fail "psql format helper streams SQL over stdin"
fi

checksum_file="$tmp/db_backup.sql.gz.sha256"
printf '%s  %s\n' \
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  "db_backup.sql.gz" >"$checksum_file"
expect_eq "$(adamant_read_checksum_file "$checksum_file" db_backup.sql.gz)" \
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  "read trusted checksum from a local file"
ln -s "$checksum_file" "$tmp/checksum-link"
expect_fail "reject symlinked trusted checksum" adamant_read_checksum_file "$tmp/checksum-link" db_backup.sql.gz

mkdir "$tmp/node-home"
ln -s "$tmp" "$tmp/node-home/.adamant"
expect_fail "reject symlinked node metadata directory" adamant_prepare_image_directory "$tmp/node-home"

pm2() {
  if [[ "${1:-}" == "jlist" ]]; then
    printf '%s' \
      '[{"name":"adamant","pid":4242,"pm2_env":{"status":"online","kill_timeout":120000,"exec_interpreter":"/opt/node/bin/node","stop_exit_codes":[130,143]}}]'
    return 0
  fi
  return 1
}
expect_eq "$(adamant_pm2_process_status adamant)" "online" "PM2 process name reaches JSON parser"
expect_eq "$(adamant_pm2_process_status missing)" "missing" "missing PM2 process remains distinguishable"
expect_eq "$(adamant_pm2_field adamant kill_timeout)" "120000" "PM2 kill timeout reaches JSON parser"
expect_eq "$(adamant_pm2_field adamant exec_interpreter)" "/opt/node/bin/node" "PM2 interpreter reaches JSON parser"
expect_eq "$(adamant_pm2_field adamant stop_exit_codes)" "130,143" "PM2 graceful exit codes reach JSON parser"
expect_eq "$(adamant_pm2_pid adamant)" "4242" "PM2 PID reaches JSON parser"
unset -f pm2

(
  adamant_pm2_pid() { printf '4242'; }
  adamant_pm2_process_status() { printf 'stopped'; }
  kill() {
    printf '%s\n' "$*" >"$tmp/graceful-signal.args"
  }
  adamant_signal_pm2_process_gracefully adamant
)
expect_eq "$(cat "$tmp/graceful-signal.args")" "-s INT -- 4242" \
  "repair path sends one catchable signal and waits"

adamant_write_ecosystem_file "$tmp/ecosystem.json" adamant "$tmp/repo" "$tmp/node" "--config test/config.json --genesis test/genesisBlock.json"
python3 - "$tmp/ecosystem.json" "$ADAMANT_KILL_TIMEOUT_MS" "$tmp/node" <<'PY'
import json
import sys
document = json.load(open(sys.argv[1], encoding="utf-8"))
app = document["apps"][0]
assert app["name"] == "adamant"
assert app["script"] == "app.js"
assert app["cwd"].endswith("/repo")
assert app["interpreter"] == sys.argv[3]
assert app["kill_timeout"] == int(sys.argv[2])
assert app["stop_exit_codes"] == [130, 143]
assert app["args"] == "--config test/config.json --genesis test/genesisBlock.json"
assert app["autorestart"] is True
PY
pass "ecosystem file sets interpreter, args, and kill_timeout"

adamant_write_systemd_dropin "$tmp/10-adamant.conf" postgresql@18-main.service redis-server.service
dropin="$(cat "$tmp/10-adamant.conf")"
if [[ "$dropin" == *$'After=postgresql@18-main.service redis-server.service'* \
  && "$dropin" == *$'Wants=postgresql@18-main.service redis-server.service'* \
  && "$dropin" == *"TimeoutStopSec=${ADAMANT_SYSTEMD_STOP_TIMEOUT_SEC}"* \
  && "$dropin" == *$'LimitCORE=0'* ]]; then
  pass "systemd drop-in orders databases and sets stop timeout"
else
  printf '%s\n' "$dropin" >&2
  fail "systemd drop-in orders databases and sets stop timeout"
fi
expect_fail "reject unsafe unit name" adamant_write_systemd_dropin "$tmp/bad.conf" 'postgresql.service;reboot'

adamant_write_pm2_systemd_unit "$tmp/pm2-adamant.service" adamant "$tmp/home"
pm2_unit="$(cat "$tmp/pm2-adamant.service")"
# shellcheck disable=SC2016
if [[ "$pm2_unit" == *$'User=adamant'* \
  && "$pm2_unit" == *'source "$HOME/.nvm/nvm.sh" && pm2 resurrect'* \
  && "$pm2_unit" == *"PM2_HOME=${tmp}/home/.pm2"* \
  && "$pm2_unit" != *'node-bin-dir'* ]]; then
  pass "systemd unit invokes PM2 only as the service user"
else
  printf '%s\n' "$pm2_unit" >&2
  fail "systemd unit invokes PM2 only as the service user"
fi
expect_fail "reject systemd home with assignment injection" \
  adamant_write_pm2_systemd_unit "$tmp/bad.service" adamant "/home/adamant Evil=1"

for release in 8 9 10; do
  for arch in x86_64 aarch64; do
    artifact="$(adamant_select_pgdg_rpm "$release" "$arch")"
    rpm_name="$(printf '%s\n' "$artifact" | sed -n '1p')"
    rpm_hash="$(printf '%s\n' "$artifact" | sed -n '2p')"
    if [[ "$rpm_name" == *"rhel${release}PGDG.noarch.rpm" && "$rpm_hash" =~ ^[0-9a-f]{64}$ ]]; then
      pass "reviewed PGDG RPM is pinned for EL ${release} ${arch}"
    else
      printf 'artifact: %s\\n' "$artifact" >&2
      fail "reviewed PGDG RPM is pinned for EL ${release} ${arch}"
    fi
  done
done
expect_fail "reject unsupported PGDG RPM target" adamant_select_pgdg_rpm 11 x86_64

if grep -n 'adamant_checksum_url' tools/install_node.sh tools/install_node_centos.sh tools/fix_node.sh >/dev/null; then
  fail "installers do not trust image-host checksum URLs"
else
  pass "installers do not trust image-host checksum URLs"
fi
if grep -En 'pgdg-redhat-repo-latest|ACCC4CF8' tools/install_node_centos.sh >/dev/null; then
  fail "RHEL installer does not fetch mutable or wrong-key PGDG RPMs"
else
  pass "RHEL installer does not fetch mutable or wrong-key PGDG RPMs"
fi
if grep -En 'cat .*\.adamant.*(node-bin-dir|ecosystem-path)' \
  tools/install_node.sh tools/install_node_centos.sh tools/fix_node.sh tools/lib/adamant_node_common.sh >/dev/null; then
  fail "root does not read service-owned PM2 marker files"
else
  pass "root does not read service-owned PM2 marker files"
fi
if grep -n 'mktemp.*NODE_HOME' tools/install_node.sh tools/install_node_centos.sh >/dev/null; then
  fail "database password is not staged in a service-owned directory"
else
  pass "database password is staged in a root-owned directory"
fi
if grep -En 'chown .*images|chown -[A-Za-z]*R' tools/fix_node.sh tools/lib/adamant_node_common.sh >/dev/null; then
  fail "root does not recursively chown service-controlled image paths"
else
  pass "root does not recursively chown service-controlled image paths"
fi
if [[ "$(grep -lF -- '--single-transaction' \
  tools/lib/adamant_node_common.sh tools/fix_node.sh | wc -l | tr -d '[:space:]')" == "2" ]]; then
  pass "blockchain image restore is transaction-wrapped"
else
  fail "blockchain image restore is transaction-wrapped"
fi
if grep -n 'module reset postgresql' tools/install_node_centos.sh >/dev/null; then
  pass "PGDG failure restores the distribution PostgreSQL module"
else
  fail "PGDG failure restores the distribution PostgreSQL module"
fi
if grep -F "requestShutdown('SIGTERM', 143)" app.js >/dev/null \
  && grep -F "requestShutdown('SIGINT', 130)" app.js >/dev/null; then
  pass "graceful signal exit codes remain distinguishable from fatal exit 0"
else
  fail "graceful signal exit codes remain distinguishable from fatal exit 0"
fi

python3 - <<'PY'
import json
package = json.load(open("package.json", encoding="utf-8"))
allow = package["allowScripts"]
assert allow["libpq@1.8.15"] is True
assert allow["javascript-obfuscator"] is False
PY
pass "package.json reviews libpq and denies javascript-obfuscator"

rm -rf -- "$tmp"

if (( failures > 0 )); then
  printf '%s check(s) failed.\n' "$failures" >&2
  exit 1
fi
printf 'All installer helper checks passed.\n'
