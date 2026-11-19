#!/usr/bin/env bash
# Shared helpers for the ADAMANT node installers and the Ubuntu repair tool.
# Operational only: this file must not change consensus, serialization, or validation.
#
# Pinned tooling (reviewed for issue #282, each release is older than the
# 7-day dependency quarantine at the time of that review):
#   npm 11.21.1          published 2026-10-15
#   pm2 7.1.1            published 2026-10-23
#   pm2-logrotate 3.0.0  published 2025-09-02
#   nvm 0.40.5
# npm 11.21 keeps the install-script allowlist behavior operators hit with
# npm 11.19. Global installs also pass --min-release-age so a newer pin cannot
# be fetched on the day it is published.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf 'Source this library from tools/install_node.sh, tools/install_node_centos.sh, or tools/fix_node.sh.\n' >&2
  exit 2
fi

ADAMANT_COMMON_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

readonly ADAMANT_INSTALLER_VERSION="2.5.0"
readonly ADAMANT_REPAIR_VERSION="1.5.0"
readonly ADAMANT_NVM_VERSION="0.40.5"
readonly ADAMANT_NPM_VERSION="11.21.1"
readonly ADAMANT_PM2_VERSION="7.1.1"
readonly ADAMANT_PM2_LOGROTATE_VERSION="3.0.0"
readonly ADAMANT_MIN_RELEASE_AGE_DAYS="7"
# PM2 waits this long after SIGINT before SIGKILL. systemd must wait longer.
readonly ADAMANT_KILL_TIMEOUT_MS="120000"
readonly ADAMANT_SYSTEMD_STOP_TIMEOUT_SEC="180"
# node-schedule 1.3 (pm2-logrotate 3.0.0) rejects day-of-month 0.
# "0 0 1 * *" is 00:00 on the first day of each month.
readonly ADAMANT_LOGROTATE_INTERVAL="0 0 1 * *"
readonly ADAMANT_IMAGE_MARGIN_BYTES="$((256 * 1024 * 1024))"
readonly ADAMANT_MAX_SAFE_INTEGER="9223372036854775807"
readonly ADAMANT_TRUSTED_LIBRARY_DIR="/usr/local/lib/adamant"
readonly ADAMANT_TRUSTED_LIBRARY="$ADAMANT_TRUSTED_LIBRARY_DIR/adamant_node_common.sh"

adamant_apply_network() {
  case "$1" in
    mainnet)
      network="mainnet"
      username="adamant"
      databasename="adamant_main"
      configfile="config.json"
      processname="adamant"
      port="36666"
      image_url="https://explorer.adamant.im/db_backup.sql.gz"
      ;;
    testnet)
      network="testnet"
      username="adamanttest"
      databasename="adamant_test"
      configfile="test/config.json"
      processname="adamanttest"
      port="36667"
      image_url="https://testnet.adamant.im/db_test_backup.sql.gz"
      ;;
    *)
      return 2
      ;;
  esac
}

adamant_apply_node_major() {
  case "$1" in
    22|jod) nodejs="22" ;;
    24|krypton) nodejs="24" ;;
    26) nodejs="26" ;;
    *)
      return 2
      ;;
  esac
}

adamant_require_interactive_tty() {
  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    printf '\nThis command needs an interactive terminal for confirmations and passwords.\n' >&2
    printf 'Run it from a verified Git checkout. See README.md, "Verified install".\n\n' >&2
    return 1
  fi
}

adamant_read_tty() {
  local prompt_text="$1"
  local response

  printf '%s' "$prompt_text" >/dev/tty
  IFS= read -r response </dev/tty
  printf '%s' "$response"
}

adamant_read_secret_tty() {
  local prompt_text="$1"
  local response

  printf '%s' "$prompt_text" >/dev/tty
  IFS= read -r -s response </dev/tty
  printf '\n' >/dev/tty
  printf '%s' "$response"
}

adamant_confirm_exact_yes() {
  local prompt_text="$1"
  local response

  response="$(adamant_read_tty "$prompt_text")"
  [[ "$response" == "yes" ]]
}

adamant_assert_pg_identifier() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
    printf 'Invalid %s %q. Expected a PostgreSQL identifier (letters, digits, underscore).\n' \
      "$label" "$value" >&2
    return 1
  fi
}

adamant_assert_port() {
  local value="$1"

  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf 'Invalid TCP port %q.\n' "$value" >&2
    return 1
  fi
  if (( value < 1 || value > 65535 )); then
    printf 'Invalid TCP port %q.\n' "$value" >&2
    return 1
  fi
}

adamant_normalize_sha256() {
  local value="$1"

  if [[ ! "$value" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    printf 'Invalid SHA-256 digest %q.\n' "$value" >&2
    return 1
  fi
  printf '%s' "$value" | tr '[:upper:]' '[:lower:]'
}

adamant_dollar_quote() {
  local value="$1"
  local tag=""
  local attempts=0

  while (( attempts < 10 )); do
    tag="adm$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
    if [[ "$value" != *"$tag"* ]]; then
      printf '$%s$%s$%s$' "$tag" "$value" "$tag"
      return 0
    fi
    attempts=$((attempts + 1))
  done
  printf 'Could not dollar-quote a PostgreSQL value.\n' >&2
  return 1
}

# Print a psql script that runs format(...) \\gexec. Arguments are printed
# literally so passwords are not evaluated as shell expansions.
adamant_render_format_sql() {
  local template="$1"
  local arg
  shift

  if [[ "$template" == *\'* ]]; then
    printf 'Refusing a SQL format template that contains a single quote.\n' >&2
    return 1
  fi
  printf '%s' "SELECT format('"
  printf '%s' "$template"
  printf '%s' "'"
  for arg in "$@"; do
    printf '%s' ', '
    printf '%s' "$arg"
  done
  printf '%s\n' ') \gexec'
}

adamant_psql_format_gexec() {
  local psql_bin="$1"
  local database="$2"
  local template="$3"
  shift 3

  adamant_render_format_sql "$template" "$@" \
    | runuser -u postgres -- "$psql_bin" -X --set=ON_ERROR_STOP=1 -f - "$database"
}

adamant_psql_scalar() {
  local psql_bin="$1"
  local database="$2"
  local sql="$3"

  runuser -u postgres -- "$psql_bin" -XAtqc "$sql" "$database"
}

adamant_role_exists() {
  local psql_bin="$1"
  local username="$2"
  local found

  adamant_assert_pg_identifier "$username" "PostgreSQL role"
  found="$(adamant_psql_scalar "$psql_bin" postgres \
    "SELECT 1 FROM pg_roles WHERE rolname = '${username}'")"
  [[ "$found" == "1" ]]
}

adamant_database_exists() {
  local psql_bin="$1"
  local databasename="$2"
  local found

  adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
  found="$(adamant_psql_scalar "$psql_bin" postgres \
    "SELECT 1 FROM pg_database WHERE datname = '${databasename}'")"
  [[ "$found" == "1" ]]
}

adamant_database_has_tables() {
  local psql_bin="$1"
  local databasename="$2"
  local found

  adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
  found="$(adamant_psql_scalar "$psql_bin" "$databasename" \
    "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema'))")"
  [[ "$found" == "t" ]]
}

adamant_set_role_password() {
  local psql_bin="$1"
  local username="$2"
  local password="$3"
  local verb="CREATE ROLE"
  local quoted

  adamant_assert_pg_identifier "$username" "PostgreSQL role"
  quoted="$(adamant_dollar_quote "$password")"
  if adamant_role_exists "$psql_bin" "$username"; then
    verb="ALTER ROLE"
    printf '\nUpdating the password for existing PostgreSQL role %s.\n' "$username"
  else
    printf '\nCreating PostgreSQL role %s.\n' "$username"
  fi
  adamant_psql_format_gexec "$psql_bin" postgres \
    "${verb} %I WITH LOGIN PASSWORD %L" \
    "'${username}'" \
    "$quoted"
}

adamant_set_database_owner() {
  local psql_bin="$1"
  local databasename="$2"
  local username="$3"

  adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
  adamant_assert_pg_identifier "$username" "PostgreSQL role"
  adamant_psql_format_gexec "$psql_bin" postgres \
    "ALTER DATABASE %I OWNER TO %I" \
    "'${databasename}'" \
    "'${username}'"
}

adamant_terminate_database_connections() {
  local psql_bin="$1"
  local databasename="$2"

  adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
  printf '\nTerminating active connections to database %s.\n' "$databasename"
  adamant_psql_format_gexec "$psql_bin" postgres \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %L AND pid <> pg_backend_pid()" \
    "'${databasename}'"
}

adamant_drop_database() {
  local psql_bin="$1"
  local databasename="$2"
  local status=0

  adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
  printf 'Dropping database %s.\n' "$databasename"
  if ! adamant_psql_format_gexec "$psql_bin" postgres \
    "DROP DATABASE IF EXISTS %I WITH (FORCE)" \
    "'${databasename}'"; then
    printf 'DROP DATABASE WITH (FORCE) failed; retrying without FORCE.\n'
    adamant_psql_format_gexec "$psql_bin" postgres \
      "DROP DATABASE IF EXISTS %I" \
      "'${databasename}'" || status=$?
  fi
  return "$status"
}

adamant_ensure_hosts_entry() {
  local hostname_value

  hostname_value="$(hostname)"
  if ! awk -v hostname="$hostname_value" '
    $1 !~ /^#/ {
      for (field = 2; field <= NF; field++) {
        if ($field == hostname) {
          found = 1
        }
      }
    }
    END { exit !found }
  ' /etc/hosts; then
    printf '\nAdding hostname %s to /etc/hosts.\n' "$hostname_value"
    printf '\n127.0.1.1\t%s\n' "$hostname_value" >>/etc/hosts
  else
    printf '\nThe /etc/hosts hostname entry is already present.\n'
  fi
}

adamant_prompt_db_password() {
  local username="$1"
  local password="" confirmation=""

  while true; do
    password="$(adamant_read_secret_tty "$(printf '\nSet the PostgreSQL database password for role %s.\nThis is not the Linux user login password.\n> ' "$username")")"
    confirmation="$(adamant_read_secret_tty "$(printf 'Confirm the PostgreSQL database password:\n> ')")"
    if [[ -z "$password" ]]; then
      printf 'The database password cannot be empty. Try again.\n' >&2
    elif [[ "$password" != "$confirmation" ]]; then
      printf 'The passwords do not match. Try again.\n' >&2
    else
      printf '%s' "$password"
      return 0
    fi
  done
}

adamant_install_mode_directory() {
  local path="$1"

  install -d -m 0755 "$path"
  chmod 0755 "$path"
}

adamant_repair_node_user_permissions() {
  local user="$1"
  local home="$2"
  local repo="$3"
  local path

  for path in "$home/.nvm" "$home/.pm2" "$home/.adamant" "$repo"; do
    if [[ -L "$path" ]]; then
      printf 'Refusing to repair symlinked node path %s.\n' "$path" >&2
      return 1
    fi
    if [[ -e "$path" ]]; then
      if [[ "$(stat -c '%U' "$path" 2>/dev/null || true)" != "$user" ]]; then
        printf 'Refusing to change ownership of %s from root. Fix ownership manually before rerunning.\n' "$path" >&2
        return 1
      fi
      runuser -u "$user" -- chmod -R u+rwX -- "$path"
    fi
  done
}

adamant_publish_trusted_library() {
  if [[ -L "$ADAMANT_TRUSTED_LIBRARY_DIR" || -L "$ADAMANT_TRUSTED_LIBRARY" ]]; then
    printf 'Refusing to publish through a symlink under %s.\n' \
      "$ADAMANT_TRUSTED_LIBRARY_DIR" >&2
    return 1
  fi
  install -d -m 0755 "$ADAMANT_TRUSTED_LIBRARY_DIR"
  install -m 0644 "$ADAMANT_COMMON_SRC" "$ADAMANT_TRUSTED_LIBRARY"
  chown root:root "$ADAMANT_TRUSTED_LIBRARY_DIR" "$ADAMANT_TRUSTED_LIBRARY"
}

adamant_content_length_from_headers() {
  awk 'tolower($1) ~ /^content-length:$/ {
      gsub(/\r/, "", $2)
      value = $2
    }
    END { print value }'
}

adamant_free_bytes() {
  local path="$1"
  local free

  free="$(df -B1 --output=avail "$path" | awk 'NR == 2 { print $1 }')"
  if [[ ! "$free" =~ ^[0-9]+$ ]]; then
    printf 'Could not read free space for %s.\n' "$path" >&2
    return 1
  fi
  printf '%s' "$free"
}

adamant_space_allows_bytes() {
  local free_bytes="$1"
  local need_bytes="$2"
  local margin_bytes="$3"
  local free_normalized need_normalized margin_normalized value

  [[ "$free_bytes" =~ ^[0-9]+$ && "$need_bytes" =~ ^[0-9]+$ && "$margin_bytes" =~ ^[0-9]+$ ]] || return 1
  free_normalized="${free_bytes#"${free_bytes%%[!0]*}"}"
  need_normalized="${need_bytes#"${need_bytes%%[!0]*}"}"
  margin_normalized="${margin_bytes#"${margin_bytes%%[!0]*}"}"
  [[ -n "$free_normalized" ]] || free_normalized=0
  [[ -n "$need_normalized" ]] || need_normalized=0
  [[ -n "$margin_normalized" ]] || margin_normalized=0
  for value in "$free_normalized" "$need_normalized" "$margin_normalized"; do
    if (( ${#value} > ${#ADAMANT_MAX_SAFE_INTEGER} )); then
      return 1
    fi
    if (( ${#value} == ${#ADAMANT_MAX_SAFE_INTEGER} )) \
      && [[ "$value" != "$ADAMANT_MAX_SAFE_INTEGER" ]] \
      && [[ "$(printf '%s\n%s\n' "$value" "$ADAMANT_MAX_SAFE_INTEGER" | LC_ALL=C sort | tail -1)" == "$value" ]]; then
      return 1
    fi
  done
  (( 10#$free_normalized >= 10#$margin_normalized )) || return 1
  (( 10#$need_normalized <= 10#$free_normalized - 10#$margin_normalized ))
}

adamant_parse_checksum_text() {
  local text="$1"
  local expected_name="$2"
  local line="" hash="" name=""

  if (( ${#text} > 512 )); then
    printf 'Checksum file is too large to be a SHA-256 digest.\n' >&2
    return 1
  fi
  if [[ "$text" == *"<html"* || "$text" == *"<HTML"* || "$text" == *"<!doctype"* || "$text" == *"<!DOCTYPE"* ]]; then
    printf 'Checksum URL returned an HTML page, not a SHA-256 digest.\n' >&2
    return 1
  fi
  line="$(printf '%s\n' "$text" | awk 'NF && $0 !~ /^#/ { print; exit }')"
  if [[ ! "$line" =~ ^([0-9A-Fa-f]{64})([[:space:]]+([^[:space:]]+))?$ ]]; then
    printf 'Checksum file does not contain a SHA-256 digest.\n' >&2
    return 1
  fi
  hash="$(adamant_normalize_sha256 "${BASH_REMATCH[1]}")"
  name="${BASH_REMATCH[3]:-}"
  name="${name#\*}"
  if [[ -n "$name" && "$name" != "$expected_name" ]]; then
    printf 'Checksum file names %s, expected %s.\n' "$name" "$expected_name" >&2
    return 1
  fi
  printf '%s' "$hash"
}

adamant_read_checksum_file() {
  local path="$1"
  local expected_name="$2"
  local size text

  if [[ -L "$path" || ! -f "$path" || ! -r "$path" ]]; then
    printf 'Checksum file %s is not a regular readable file.\n' "$path" >&2
    return 1
  fi
  size="$(wc -c <"$path" | tr -d '[:space:]')"
  if [[ ! "$size" =~ ^[0-9]+$ ]] || (( size > 512 )); then
    printf 'Checksum file %s is too large.\n' "$path" >&2
    return 1
  fi
  text="$(cat -- "$path")"
  adamant_parse_checksum_text "$text" "$expected_name"
}

adamant_verify_file_sha256() {
  local expected="$1"
  local path="$2"
  local actual

  expected="$(adamant_normalize_sha256 "$expected")"
  if [[ ! -f "$path" || -L "$path" ]]; then
    printf 'Cannot verify non-regular file %s.\n' "$path" >&2
    return 1
  fi
  actual="$(sha256sum "$path" | awk 'NR == 1 { print $1 }')"
  actual="$(adamant_normalize_sha256 "$actual")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'SHA-256 mismatch for %s: expected %s, got %s.\n' \
      "$path" "$expected" "$actual" >&2
    return 1
  fi
}

adamant_remote_content_length() {
  local url="$1"
  local headers="" length=""

  if ! headers="$(curl --proto '=https' --proto-redir '=https' -fsSLI --retry 3 --connect-timeout 20 --max-time 60 "$url")"; then
    printf 'Could not read the size of %s.\n' "$url" >&2
    return 1
  fi
  length="$(printf '%s\n' "$headers" | adamant_content_length_from_headers)"
  if [[ ! "$length" =~ ^[0-9]+$ || "$length" == "0" ]]; then
    printf 'The image server did not provide a Content-Length for %s.\n' "$url" >&2
    return 1
  fi
  if ! adamant_space_allows_bytes "$ADAMANT_MAX_SAFE_INTEGER" "$length" 0; then
    printf 'Content-Length %s is outside the supported range.\n' "$length" >&2
    return 1
  fi
  printf '%s' "$length"
}

adamant_download_verified_archive() {
  local destination_dir="$1"
  local url="$2"
  local filename="$3"
  local expected_hash="$4"
  local part dest free_bytes image_bytes

  if [[ ! "$filename" =~ ^[A-Za-z0-9._-]+$ ]]; then
    printf 'Refusing image filename %q.\n' "$filename" >&2
    return 1
  fi
  expected_hash="$(adamant_normalize_sha256 "$expected_hash")"
  mkdir -p "$destination_dir"
  image_bytes="$(adamant_remote_content_length "$url")" || return 1
  free_bytes="$(adamant_free_bytes "$destination_dir")" || return 1
  if ! adamant_space_allows_bytes "$free_bytes" "$image_bytes" "$ADAMANT_IMAGE_MARGIN_BYTES"; then
    printf 'Not enough free space in %s for %s bytes (free %s, margin %s).\n' \
      "$destination_dir" "$image_bytes" "$free_bytes" "$ADAMANT_IMAGE_MARGIN_BYTES" >&2
    return 1
  fi
  part="${destination_dir}/${filename}.part"
  dest="${destination_dir}/${filename}"
  rm -f -- "$part" "$dest"
  printf 'Downloading %s (%s bytes).\n' "$url" "$image_bytes"
  curl --proto '=https' --proto-redir '=https' -fL --retry 3 --connect-timeout 30 \
    -o "$part" "$url"
  mv -- "$part" "$dest"
  if ! adamant_verify_file_sha256 "$expected_hash" "$dest"; then
    rm -f -- "$dest"
    printf 'SHA-256 verification failed for %s. The archive was deleted.\n' "$filename" >&2
    return 1
  fi
  if ! gzip --test "$dest"; then
    rm -f -- "$dest"
    printf 'gzip rejected %s. The archive was deleted.\n' "$filename" >&2
    return 1
  fi
  printf 'Verified %s.\n' "$filename"
}

adamant_json_bool() {
  local json="$1"
  local key="$2"
  local compact rest

  compact="${json//[[:space:]]/}"
  rest="${compact#*"\"${key}\":"}"
  if [[ "$rest" == "$compact" ]]; then
    printf ''
    return 0
  fi
  if [[ "$rest" == true* ]]; then
    printf 'true'
  elif [[ "$rest" == false* ]]; then
    printf 'false'
  fi
}

# Return 1 and print a reason when an online node must not be restarted.
adamant_loader_block_reason() {
  local pm2_status="$1"
  local status_body="$2"
  local status_code="$3"
  local sync_body="$4"
  local sync_code="$5"
  local loaded="" syncing="" combined=""

  case "$pm2_status" in
    online|launching|stopping) ;;
    missing-cli)
      printf 'The pm2 CLI is unavailable for the node user.\n'
      return 1
      ;;
    unknown)
      printf 'The pm2 process list could not be read.\n'
      return 1
      ;;
    *)
      return 0
      ;;
  esac

  if [[ "$status_code" == "000" || -z "$status_code" ]]; then
    printf 'The node process is %s, but the loader API did not respond.\n' "$pm2_status"
    return 1
  fi

  combined="${status_body} ${sync_body}"
  if [[ "$combined" == *"Blockchain is loading"* ]]; then
    printf 'The node is still loading or rebuilding the blockchain.\n'
    return 1
  fi
  if [[ "$combined" == *"API access denied"* || "$combined" == *"API access disabled"* ]]; then
    printf 'The node API refused access, so the installer cannot tell whether it is syncing.\n'
    return 1
  fi

  loaded="$(adamant_json_bool "$status_body" loaded)"
  syncing="$(adamant_json_bool "$sync_body" syncing)"
  if [[ "$loaded" == "false" ]]; then
    printf 'The node reports loaded=false and may still be rebuilding.\n'
    return 1
  fi
  if [[ "$syncing" == "true" ]]; then
    printf 'The node reports syncing=true.\n'
    return 1
  fi
  if [[ -z "$loaded" || -z "$syncing" ]]; then
    if [[ "$sync_code" == "000" || -z "$sync_code" ]]; then
      printf 'The node process is %s, but the sync API did not respond.\n' "$pm2_status"
      return 1
    fi
    printf 'The loader status response was not readable.\n'
    return 1
  fi
  if [[ "$loaded" != "true" || "$syncing" != "false" ]]; then
    printf 'The loader status response was not readable.\n'
    return 1
  fi
  return 0
}

adamant_pm2_process_status() {
  local process="$1"
  local raw="" status=""

  if ! command -v pm2 >/dev/null 2>&1; then
    printf 'missing-cli'
    return 0
  fi
  if ! raw="$(pm2 jlist 2>/dev/null)"; then
    printf 'unknown'
    return 0
  fi
  status="$(PROCESS_NAME="$process" printf '%s' "$raw" | node -e '
const fs = require("fs");
const name = process.env.PROCESS_NAME;
let data;
try { data = JSON.parse(fs.readFileSync(0, "utf8")); }
catch (error) { process.stdout.write("unknown"); process.exit(0); }
if (!Array.isArray(data)) { process.stdout.write("unknown"); process.exit(0); }
const found = data.find((item) => item && item.name === name);
if (!found) { process.stdout.write("missing"); process.exit(0); }
const value = found.pm2_env && found.pm2_env.status ? String(found.pm2_env.status) : "unknown";
process.stdout.write(value);
')" || status="unknown"
  if [[ -z "$status" ]]; then
    status="unknown"
  fi
  printf '%s' "$status"
}

adamant_curl_local_api() {
  local port="$1"
  local path="$2"
  local body_file="$3"
  local code=""

  adamant_assert_port "$port"
  code="$(curl -sS -m 5 -o "$body_file" -w '%{http_code}' "http://127.0.0.1:${port}${path}" || true)"
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    code="000"
  fi
  printf '%s' "$code"
}

adamant_print_restart_block_reason() {
  local process="${PROCESS_NAME:?}"
  local port="${API_PORT:?}"
  local config_file="${CONFIG_FILE:-}"
  local pm2_status status_file sync_file status_code sync_code status_body sync_body reason=""

  if [[ -n "$config_file" && -f "$config_file" ]]; then
    local configured=""
    configured="$(CONFIG_FILE="$config_file" node -e '
const fs = require("fs");
try {
  const value = JSON.parse(fs.readFileSync(process.env.CONFIG_FILE, "utf8")).port;
  if (Number.isInteger(value) && value >= 1 && value <= 65535) process.stdout.write(String(value));
} catch (error) {}
' || true)"
    if [[ -n "$configured" ]]; then
      port="$configured"
    fi
  fi

  pm2_status="$(adamant_pm2_process_status "$process")"
  status_file="$(mktemp)"
  sync_file="$(mktemp)"
  status_code="$(adamant_curl_local_api "$port" "/api/loader/status" "$status_file")"
  sync_code="$(adamant_curl_local_api "$port" "/api/loader/status/sync" "$sync_file")"
  status_body="$(cat "$status_file" 2>/dev/null || true)"
  sync_body="$(cat "$sync_file" 2>/dev/null || true)"
  rm -f -- "$status_file" "$sync_file"
  reason="$(adamant_loader_block_reason "$pm2_status" "$status_body" "$status_code" "$sync_body" "$sync_code" || true)"
  if [[ -n "$reason" ]]; then
    printf '%s' "$reason"
  fi
}

adamant_refuse_if_node_busy() {
  local user="$1"
  local home="$2"
  local process="$3"
  local port="$4"
  local config_file="$5"
  local force="$6"
  local output=""

  if [[ "$force" == "true" ]]; then
    printf 'Force flag set; a syncing or rebuilding node may be restarted.\n'
    return 0
  fi
  if ! id -u "$user" >/dev/null 2>&1; then
    return 0
  fi
  if [[ ! -s "$home/.nvm/nvm.sh" ]]; then
    if [[ -f "$config_file" ]]; then
      printf 'The node checkout exists, but nvm is missing; PM2 state cannot be verified safely.\n' >&2
      return 1
    fi
    return 0
  fi
  output="$(runuser -u "$user" -- env \
    HOME="$home" \
    PROCESS_NAME="$process" \
    API_PORT="$port" \
    CONFIG_FILE="$config_file" \
    ADAMANT_LIB="$ADAMANT_TRUSTED_LIBRARY" \
    bash --noprofile --norc -s <<'EOS'
set -Eeuo pipefail
# shellcheck disable=SC1090
source "$HOME/.nvm/nvm.sh"
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
adamant_print_restart_block_reason
EOS
)"
  if [[ -n "$output" ]]; then
    printf '%s\n' "$output" >&2
    printf 'The node was left running. Re-run with -f only after accepting a restart during sync or rebuild.\n' >&2
    return 1
  fi
}

adamant_write_ecosystem_file() {
  local destination="$1"
  local process_name="$2"
  local repo_dir="$3"
  local interpreter="$4"
  local args="$5"

  DEST="$destination" \
  PROCESS_NAME="$process_name" \
  REPO_DIR="$repo_dir" \
  INTERPRETER="$interpreter" \
  APP_ARGS="$args" \
  KILL_TIMEOUT="$ADAMANT_KILL_TIMEOUT_MS" \
  python3 - <<'PY'
import json
import os

document = {
    "apps": [
        {
            "name": os.environ["PROCESS_NAME"],
            "cwd": os.environ["REPO_DIR"],
            "script": "app.js",
            "args": os.environ["APP_ARGS"],
            "interpreter": os.environ["INTERPRETER"],
            "kill_timeout": int(os.environ["KILL_TIMEOUT"]),
            "autorestart": True,
        }
    ]
}
with open(os.environ["DEST"], "w", encoding="utf-8") as handle:
    json.dump(document, handle, indent=2)
    handle.write("\n")
PY
  chmod 0640 "$destination"
}

adamant_assert_unit_name() {
  local unit="$1"

  if [[ ! "$unit" =~ ^[A-Za-z0-9@._-]+\.service$ ]]; then
    printf 'Refusing systemd unit name %q.\n' "$unit" >&2
    return 1
  fi
}

adamant_detect_database_units() {
  local extra unit candidate version name listed
  local -a units=()

  for extra in "$@"; do
    [[ -n "$extra" ]] || continue
    adamant_assert_unit_name "$extra"
    units+=("$extra")
  done
  if command -v pg_lsclusters >/dev/null 2>&1; then
    while read -r version name _; do
      [[ -n "${version:-}" && -n "${name:-}" ]] || continue
      unit="postgresql@${version}-${name}.service"
      adamant_assert_unit_name "$unit"
      units+=("$unit")
    done < <(pg_lsclusters -h || true)
  fi
  if command -v systemctl >/dev/null 2>&1; then
    for candidate in redis-server.service redis.service; do
      listed="$(systemctl list-unit-files --type=service --no-legend "$candidate" 2>/dev/null || true)"
      if [[ "$listed" == *"$candidate"* ]]; then
        units+=("$candidate")
        break
      fi
    done
  fi
  if (( ${#units[@]} == 0 )); then
    return 0
  fi
  printf '%s\n' "${units[@]}" | awk 'NF && !seen[$0]++ { print }' | paste -sd ' ' -
}

adamant_write_systemd_dropin() {
  local destination="$1"
  shift
  local unit line

  mkdir -p "$(dirname "$destination")"
  {
    printf '%s\n' '[Unit]'
    if (( $# > 0 )); then
      line=""
      for unit in "$@"; do
        adamant_assert_unit_name "$unit" || return 1
        line+="${unit} "
      done
      printf 'After=%s\n' "${line% }"
      printf 'Wants=%s\n' "${line% }"
    fi
    printf '%s\n' '[Service]'
    printf 'TimeoutStopSec=%s\n' "$ADAMANT_SYSTEMD_STOP_TIMEOUT_SEC"
    printf '%s\n' 'LimitCORE=0'
  } >"$destination"
  chmod 0644 "$destination"
}

adamant_write_pm2_systemd_unit() {
  local destination="$1"
  local user="$2"
  local home="$3"

  if [[ ! "$user" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    printf 'Refusing unsafe system user name %q.\n' "$user" >&2
    return 1
  fi
  if [[ -z "$home" || "${home#/}" == "$home" || "$home" == *$'\n'* ]]; then
    printf 'Refusing unsafe home directory %q.\n' "$home" >&2
    return 1
  fi
  if [[ -L "$home" ]]; then
    printf 'Refusing symlinked home directory %s.\n' "$home" >&2
    return 1
  fi
  cat >"$destination" <<EOF
[Unit]
Description=PM2 process manager for ${user}
After=network.target

[Service]
Type=forking
User=${user}
Environment=HOME=${home}
Environment=PM2_HOME=${home}/.pm2
PIDFile=${home}/.pm2/pm2.pid
ExecStart=/usr/bin/env bash -lc 'source "\$HOME/.nvm/nvm.sh" && pm2 resurrect'
ExecReload=/usr/bin/env bash -lc 'source "\$HOME/.nvm/nvm.sh" && pm2 reload all'
ExecStop=/usr/bin/env bash -lc 'source "\$HOME/.nvm/nvm.sh" && pm2 kill'
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "$destination"
}

adamant_install_pm2_systemd() {
  local user="$1"
  local home="$2"
  local _node_bin_dir="$3"
  shift 3
  local service="pm2-${user}.service"
  local service_file="/etc/systemd/system/${service}"
  local dropin="/etc/systemd/system/pm2-${user}.service.d/10-adamant.conf"
  local -a units=("$@")

  if ! command -v systemctl >/dev/null 2>&1 || [[ "$(ps -p 1 -o comm=)" != "systemd" ]]; then
    printf '\nWARNING: systemd was not detected. Configure pm2 startup manually for user %s.\n' "$user"
    return 0
  fi
  if ! runuser -u "$user" -- env HOME="$home" bash --noprofile --norc -lc \
    "source \"\$HOME/.nvm/nvm.sh\" && command -v pm2 >/dev/null"; then
    printf 'pm2 is unavailable for user %s; cannot configure systemd startup.\n' "$user" >&2
    return 1
  fi
  printf '\nEnabling pm2 startup for user %s.\n' "$user"
  adamant_write_pm2_systemd_unit "$service_file" "$user" "$home"
  adamant_write_systemd_dropin "$dropin" "${units[@]}"
  systemctl daemon-reload
  systemctl enable "$service" >/dev/null
  systemctl restart "$service"
  printf 'Installed %s (TimeoutStopSec=%s, LimitCORE=0).\n' \
    "$dropin" "$ADAMANT_SYSTEMD_STOP_TIMEOUT_SEC"
}

adamant_pgdg_policy_usable() {
  local policy="$1"
  local candidate

  candidate="$(printf '%s\n' "$policy" | awk '/^  Candidate:/ { print $2; exit }')"
  if [[ -z "$candidate" || "$candidate" == "(none)" ]]; then
    return 1
  fi
  [[ "$policy" == *"postgresql.org"* ]]
}

adamant_prompt_blockchain_image() {
  local response

  printf '\nA blockchain image can reduce synchronization time, but its source must be trusted.\n'
  printf 'The image is loaded only after a locally provided trusted SHA-256 file matches the download.\n'
  printf 'Without an image, the node verifies the blockchain from height 1, which may take several days.\n'
  response="$(adamant_read_tty "Use the official ADAMANT blockchain image to bootstrap? [Y/n]: ")"
  case "${response:-Y}" in
    [yY][eE][sS]|[yY]|[jJ]|"")
      use_image="true"
      ;;
    *)
      printf 'The node will synchronize from scratch.\n'
      use_image="false"
      ;;
  esac
}

adamant_run_quiet() {
  local description="$1"
  local log_file
  shift

  log_file="$(mktemp)"
  printf '%s\n' "$description"
  if "$@" >"$log_file" 2>&1; then
    rm -f -- "$log_file"
    return 0
  fi
  cat "$log_file" >&2
  rm -f -- "$log_file"
  return 1
}

adamant_sync_git_checkout() {
  local repo="$1"
  local branch="$2"

  if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
    printf 'Invalid Git branch name: %q.\n' "$branch" >&2
    return 2
  fi
  if [[ ! -e "$repo" ]]; then
    printf '\nCloning ADAMANT branch %s.\n' "$branch"
    git clone --branch "$branch" --single-branch https://github.com/Adamant-im/adamant "$repo"
    return 0
  fi
  if [[ ! -d "$repo/.git" ]]; then
    printf '\nExisting path %s is not an ADAMANT Git checkout. Refusing to overwrite it.\n' "$repo" >&2
    return 1
  fi
  printf '\nExisting ADAMANT checkout found. Fetching branch %s.\n' "$branch"
  git -C "$repo" fetch --prune origin "$branch"
  if [[ -n "$(git -C "$repo" status --porcelain --untracked-files=no)" ]]; then
    printf 'Local repository changes detected; preserving the current checkout without switching branches.\n'
    return 0
  fi
  if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo" checkout "$branch"
  else
    git -C "$repo" checkout --track -b "$branch" "origin/$branch"
  fi
  if ! git -C "$repo" merge --ff-only "origin/$branch"; then
    printf 'WARNING: The local branch cannot be fast-forwarded; preserving its current history.\n'
  fi
}

adamant_install_toolchain() {
  local previous_pm2=""

  cd "$HOME" || return
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    previous_pm2="$(command -v pm2 || true)"
  fi
  printf '\nInstalling or updating nvm v%s and Node.js %s.\n' "$ADAMANT_NVM_VERSION" "$NODEJS_VERSION"
  if [[ -d "$NVM_DIR/.git" ]]; then
    adamant_run_quiet "Updating nvm source." \
      git -C "$NVM_DIR" fetch --quiet --depth 1 origin \
        "refs/tags/v${ADAMANT_NVM_VERSION}:refs/tags/v${ADAMANT_NVM_VERSION}"
    git -c advice.detachedHead=false -C "$NVM_DIR" checkout --quiet "v${ADAMANT_NVM_VERSION}"
  else
    rm -rf -- "$NVM_DIR"
    adamant_run_quiet "Cloning nvm source." \
      git -c advice.detachedHead=false clone --quiet --depth 1 --branch "v${ADAMANT_NVM_VERSION}" \
        https://github.com/nvm-sh/nvm.git "$NVM_DIR"
  fi
  # shellcheck disable=SC2016
  if ! grep -q 'NVM_DIR="$HOME/.nvm"' "$HOME/.bashrc" 2>/dev/null; then
    # shellcheck disable=SC2016
    printf '\nexport NVM_DIR="$HOME/.nvm"\n' >>"$HOME/.bashrc"
    # shellcheck disable=SC2016
    printf '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' >>"$HOME/.bashrc"
  fi
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODEJS_VERSION"
  nvm alias default "$NODEJS_VERSION"
  nvm use "$NODEJS_VERSION"
  hash -r
  adamant_run_quiet "Installing npm ${ADAMANT_NPM_VERSION}." \
    npm install --global "npm@${ADAMANT_NPM_VERSION}"
  hash -r
  if [[ "$(npm --version)" != "$ADAMANT_NPM_VERSION" ]]; then
    printf 'npm %s is active, expected %s.\n' "$(npm --version)" "$ADAMANT_NPM_VERSION" >&2
    return 1
  fi
  if [[ -n "$previous_pm2" ]]; then
    printf '%s\n' "$previous_pm2" >"$HOME/.adamant/previous-pm2-bin"
  else
    rm -f -- "$HOME/.adamant/previous-pm2-bin"
  fi
  printf 'Using Node.js %s and npm %s.\n' "$(node --version)" "$(npm --version)"
}

adamant_npm_ci_project() {
  local report_file

  # shellcheck disable=SC2153
  cd "${REPO_DIR:?}" || return
  printf '\nInstalling Node.js dependencies with npm ci.\n'
  npm ci --omit=dev --no-audit --no-fund
  if [[ -n "$(git status --porcelain --untracked-files=no -- package.json)" ]]; then
    printf 'npm ci modified package.json. Refusing to continue.\n' >&2
    return 1
  fi
  report_file="$(mktemp)"
  if ! npm install-scripts ls >"$report_file" 2>&1; then
    cat "$report_file" >&2
    rm -f -- "$report_file"
    printf 'npm install-scripts ls failed. Refusing to start with unreviewed install scripts.\n' >&2
    return 1
  fi
  if grep -q 'not yet covered by allowScripts' "$report_file"; then
    cat "$report_file" >&2
    rm -f -- "$report_file"
    printf 'npm reported unreviewed dependency install scripts.\n' >&2
    return 1
  fi
  rm -f -- "$report_file"
  if ! node -e "require('pg-native')"; then
    printf 'pg-native did not load. The libpq native addon was not built.\n' >&2
    return 1
  fi
}

adamant_write_config_password() {
  local config_path="$1"
  local password_file="$2"
  local password config_tmp

  # shellcheck disable=SC2153
  cd "${REPO_DIR:?}" || return
  printf '\nConfiguring the ADAMANT node.\n'
  if [[ ! -f "$config_path" ]]; then
    if [[ "$config_path" == *"/test/config.json" ]]; then
      cp test/config.default.json "$config_path"
    else
      cp config.default.json "$config_path"
    fi
  else
    printf 'Configuration file %s already exists; preserving its settings.\n' "$config_path"
  fi
  password="$(cat "$password_file")"
  config_tmp="$(mktemp "${config_path}.tmp.XXXXXX")"
  if ! DB_PASSWORD_DECODED="$password" \
    jq '.db.password = env.DB_PASSWORD_DECODED' "$config_path" >"$config_tmp"; then
    rm -f -- "$config_tmp"
    unset password DB_PASSWORD_DECODED
    return 1
  fi
  chmod 0600 "$config_tmp"
  mv -- "$config_tmp" "$config_path"
  unset password DB_PASSWORD_DECODED
}

adamant_configure_logrotate() {
  local current="" describe_text=""

  printf '\nConfiguring pm2 log rotation.\n'
  if pm2 describe pm2-logrotate >/dev/null 2>&1; then
    pm2 uninstall pm2-logrotate >/dev/null || true
  fi
  adamant_run_quiet "Installing pm2-logrotate@${ADAMANT_PM2_LOGROTATE_VERSION}." \
    npm_config_min_release_age="$ADAMANT_MIN_RELEASE_AGE_DAYS" \
    pm2 install "pm2-logrotate@${ADAMANT_PM2_LOGROTATE_VERSION}"
  adamant_run_quiet "Setting pm2-logrotate:max_size=500M." pm2 set pm2-logrotate:max_size 500M
  adamant_run_quiet "Setting pm2-logrotate:retain=5." pm2 set pm2-logrotate:retain 5
  adamant_run_quiet "Setting pm2-logrotate:compress=true." pm2 set pm2-logrotate:compress true
  adamant_run_quiet "Setting pm2-logrotate:rotateInterval." \
    pm2 set pm2-logrotate:rotateInterval "$ADAMANT_LOGROTATE_INTERVAL"
  current="$(pm2 get "pm2-logrotate:rotateInterval" 2>/dev/null || true)"
  if [[ "$current" != *"$ADAMANT_LOGROTATE_INTERVAL"* ]]; then
    printf 'pm2-logrotate did not keep rotation schedule %s.\n' "$ADAMANT_LOGROTATE_INTERVAL" >&2
    printf '%s\n' "$current" >&2
    return 1
  fi
  describe_text="$(pm2 describe pm2-logrotate 2>/dev/null || true)"
  if [[ "$describe_text" != *"online"* ]]; then
    printf 'pm2-logrotate is not online.\n' >&2
    pm2 logs pm2-logrotate --lines 40 --nostream || true
    return 1
  fi
}

adamant_pm2_field() {
  local process="$1"
  local field="$2"
  local raw

  raw="$(pm2 jlist 2>/dev/null || true)"
  PROCESS_NAME="$process" FIELD="$field" printf '%s' "$raw" | node -e '
const fs = require("fs");
const name = process.env.PROCESS_NAME;
const field = process.env.FIELD;
let data;
try { data = JSON.parse(fs.readFileSync(0, "utf8")); }
catch (error) { process.exit(0); }
const found = Array.isArray(data) ? data.find((item) => item && item.name === name) : null;
if (!found || !found.pm2_env || found.pm2_env[field] === undefined || found.pm2_env[field] === null) process.exit(0);
process.stdout.write(String(found.pm2_env[field]));
'
}

adamant_apply_pm2_ecosystem() {
  local ecosystem="$1"
  local process="$2"
  local interpreter="$3"
  local previous_pm2="" actual_timeout="" actual_interpreter="" busy="" pm2_list=""

  if [[ -s "$HOME/.adamant/previous-pm2-bin" ]]; then
    previous_pm2="$(cat "$HOME/.adamant/previous-pm2-bin")"
  fi
  if [[ "${FORCE_RESTART:-false}" != "true" ]]; then
    busy="$(adamant_print_restart_block_reason || true)"
    if [[ -n "$busy" ]]; then
      printf '%s\n' "$busy" >&2
      printf 'Dependencies are installed, but the running node was not restarted.\n' >&2
      return 1
    fi
  fi
  if [[ -n "$previous_pm2" && -x "$previous_pm2" ]] && "$previous_pm2" describe "$process" >/dev/null 2>&1; then
    printf 'Applying the ecosystem file before replacing the pm2 binary.\n'
    "$previous_pm2" startOrRestart "$ecosystem" --update-env
  fi
  adamant_run_quiet "Installing pm2 ${ADAMANT_PM2_VERSION}." \
    npm install --global --min-release-age="$ADAMANT_MIN_RELEASE_AGE_DAYS" "pm2@${ADAMANT_PM2_VERSION}"
  hash -r
  if [[ "$(pm2 --version | awk 'NR == 1 { print; exit }')" != "$ADAMANT_PM2_VERSION" ]]; then
    printf 'pm2 %s is active, expected %s.\n' "$(pm2 --version)" "$ADAMANT_PM2_VERSION" >&2
    return 1
  fi
  pm2_list="$(pm2 ls 2>&1 || true)"
  if [[ "$pm2_list" == *"In-memory PM2 is out-of-date"* ]]; then
    printf 'Updating the in-memory pm2 daemon.\n'
    pm2 update
  fi
  printf '\nStarting the ADAMANT node from %s.\n' "$ecosystem"
  pm2 startOrRestart "$ecosystem" --update-env
  pm2 save
  actual_timeout="$(adamant_pm2_field "$process" kill_timeout)"
  actual_interpreter="$(adamant_pm2_field "$process" exec_interpreter)"
  if [[ "$actual_timeout" != "$ADAMANT_KILL_TIMEOUT_MS" ]]; then
    printf 'pm2 kill_timeout is %q, expected %s.\n' "$actual_timeout" "$ADAMANT_KILL_TIMEOUT_MS" >&2
    return 1
  fi
  if [[ "$actual_interpreter" != "$interpreter" ]]; then
    printf 'pm2 interpreter is %q, expected %s.\n' "$actual_interpreter" "$interpreter" >&2
    return 1
  fi
  printf 'pm2 process %s is using kill_timeout %s and interpreter %s.\n' \
    "$process" "$actual_timeout" "$actual_interpreter"
}

adamant_user_install() {
  local ecosystem interpreter args="" image_dir

  mkdir -p "$HOME/.adamant"
  CONFIG_FILE="${REPO_DIR:?}/${CONFIG_FILE:?}"
  API_PORT="${API_PORT:?}"
  adamant_install_toolchain
  # BRANCH, USE_IMAGE, IMAGE_URL, and NETWORK come from the root installer.
  # shellcheck disable=SC2153
  adamant_sync_git_checkout "${REPO_DIR:?}" "${BRANCH:?}"
  adamant_npm_ci_project
  adamant_write_config_password "$CONFIG_FILE" "$DB_PASSWORD_FILE"
  # shellcheck disable=SC2153
  if [[ "${USE_IMAGE:?}" == "true" ]]; then
    # shellcheck disable=SC2153
    adamant_prepare_image_directory "$HOME"
    image_dir="$HOME/.adamant/images"
    # shellcheck disable=SC2153
    adamant_download_verified_archive "$image_dir" "${IMAGE_URL:?}" "${IMAGE_FILENAME:?}" "${IMAGE_SHA256:?}"
    printf 'Streaming the blockchain image into PostgreSQL.\n'
    gzip -dc "${image_dir}/${IMAGE_FILENAME}" | psql -X --set=ON_ERROR_STOP=1 "$DATABASE_NAME"
    rm -f -- "${image_dir}/${IMAGE_FILENAME}" "${image_dir}/${IMAGE_FILENAME}.sha256"
  fi
  interpreter="$(command -v node)"
  # shellcheck disable=SC2153
  if [[ "${NETWORK:?}" != "mainnet" ]]; then
    args="--config test/config.json --genesis test/genesisBlock.json"
  fi
  ecosystem="$HOME/.adamant/ecosystem.${PROCESS_NAME}.json"
  adamant_write_ecosystem_file "$ecosystem" "$PROCESS_NAME" "$REPO_DIR" "$interpreter" "$args"
  adamant_apply_pm2_ecosystem "$ecosystem" "$PROCESS_NAME" "$interpreter"
  adamant_configure_logrotate
  pm2 save
  printf '%s\n' "$ecosystem" >"$HOME/.adamant/ecosystem-path"
  printf '%s\n' "$(dirname "$interpreter")" >"$HOME/.adamant/node-bin-dir"
}

adamant_stop_process_for_repair() {
  local ecosystem="$1"
  local process="$2"
  local interpreter="$3"
  local pm2_status=""

  if ! command -v pm2 >/dev/null 2>&1; then
    printf 'pm2 is not installed for user %s.\n' "$(id -un)" >&2
    return 1
  fi
  pm2_status="$(adamant_pm2_process_status "$process")"
  adamant_write_ecosystem_file "$ecosystem" "$process" "$REPO_DIR" "$interpreter" "${APP_ARGS:-}"
  case "$pm2_status" in
  missing)
    printf 'pm2 process %s is not registered; skipping stop.\n' "$process"
    ;;
  unknown|missing-cli|"")
    printf 'Cannot verify pm2 state for %s (status: %s).\n' "$process" "${pm2_status:-empty}" >&2
    return 1
    ;;
  *)
    printf 'Stopping %s with kill_timeout %s.\n' "$process" "$ADAMANT_KILL_TIMEOUT_MS"
    pm2 startOrRestart "$ecosystem" --update-env
    pm2 stop "$process"
    ;;
  esac
  pm2 save
}

adamant_prepare_image_directory() {
  local home="$1"
  local root_dir="${home}/.adamant"
  local image_dir="${root_dir}/images"

  if [[ -L "$root_dir" || -L "$image_dir" ]]; then
    printf 'Refusing symlinked image directory under %s.\n' "$root_dir" >&2
    return 1
  fi
  mkdir -p "$image_dir"
  chmod 0700 "$root_dir" "$image_dir"
}

adamant_prompt_trusted_image_sha256() {
  local filename="$1"
  local checksum_path="" checksum=""

  printf '\nTo verify the blockchain image, provide a SHA-256 file from a trusted channel.\n'
  printf 'Do not use a checksum downloaded from the same host as the image archive.\n'
  while true; do
    checksum_path="$(adamant_read_tty "Path to trusted checksum file for ${filename}: ")"
    if [[ -z "$checksum_path" ]]; then
      printf 'Checksum file path cannot be empty.\n' >&2
    elif checksum="$(adamant_read_checksum_file "$checksum_path" "$filename")"; then
      printf '%s' "$checksum"
      return 0
    fi
    if ! adamant_confirm_exact_yes "Type \"yes\" to provide another checksum file, or anything else to cancel: "; then
      return 1
    fi
  done
}

adamant_start_process_from_ecosystem() {
  local ecosystem="$1"
  local process="$2"
  local interpreter="$3"
  local actual_timeout=""

  printf 'Starting %s from %s.\n' "$process" "$ecosystem"
  pm2 startOrRestart "$ecosystem" --update-env
  pm2 save
  actual_timeout="$(adamant_pm2_field "$process" kill_timeout)"
  if [[ "$actual_timeout" != "$ADAMANT_KILL_TIMEOUT_MS" ]]; then
    printf 'pm2 kill_timeout is %q, expected %s.\n' "$actual_timeout" "$ADAMANT_KILL_TIMEOUT_MS" >&2
    return 1
  fi
  if [[ "$(adamant_pm2_field "$process" exec_interpreter)" != "$interpreter" ]]; then
    printf 'pm2 did not switch the interpreter to %s.\n' "$interpreter" >&2
    return 1
  fi
}

adamant_print_database_maintenance() {
  local family="$1"
  local user="$2"
  local ecosystem="$3"

  printf '\nDatabase maintenance:\n'
  printf 'PostgreSQL and Redis package updates can restart those services while the node is running.\n'
  printf 'The node does not recover from a PostgreSQL restart by itself.\n'
  if [[ "$family" == "debian" ]]; then
    printf 'Keep those packages out of unattended upgrades, for example:\n'
    printf '    apt-mark hold postgresql* redis*\n'
    printf 'Also add postgresql and redis to Unattended-Upgrade::Package-Blacklist.\n'
  else
    printf 'Exclude postgresql* and redis* packages from automatic updates on this host.\n'
  fi
  printf 'After database or Redis maintenance, restart the node and wait until the log contains "Cleaned up successfully":\n'
  printf '    su - %s\n' "$user"
  printf '    pm2 startOrRestart %s --update-env\n' "$ecosystem"
  printf 'Do not use kill -9 or PM2'\''s default 1600 ms kill timeout.\n'
}

# Entry scripts read these globals after adamant_apply_network and the prompts.
adamant_publish_shell_contract() {
  : "$ADAMANT_INSTALLER_VERSION" "$ADAMANT_REPAIR_VERSION" \
    "$network" "$username" "$databasename" "$configfile" "$processname" \
    "$port" "$image_url" "$nodejs" "$use_image"
}

adamant_print_operator_footer() {
  local action="$1"
  local network_name="$2"
  local user="$3"
  local process="$4"
  local api_port="$5"
  local log_file="$6"
  local minutes="$7"

  printf '\nADAMANT %s node %s completed successfully.\n' "$network_name" "$action"
  printf 'Total time: %s minutes.\n' "$minutes"
  printf 'Log: %s\n\n' "$log_file"
  printf 'Check the node as user %s:\n' "$user"
  printf '    su - %s\n' "$user"
  printf '    pm2 list\n'
  printf '    pm2 show %s\n' "$process"
  printf '    pm2 logs %s\n\n' "$process"
  printf 'Query the current blockchain height:\n'
  printf '    curl http://127.0.0.1:%s/api/blocks/getHeight\n\n' "$api_port"
  if [[ "$network_name" == "mainnet" && "$action" == "installation" ]]; then
    printf 'Mainnet and testnet use separate users, ports, databases, and pm2 processes.\n\n'
  fi
  if [[ -n "${STY:-}" ]]; then
    printf 'This command is running inside screen session %s.\n' "$STY"
    printf 'Detach with Ctrl-A D, or exit the shell to close the session.\n\n'
  fi
}
