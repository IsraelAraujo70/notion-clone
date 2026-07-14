#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node "$ROOT/docs/evals/m5-quality-check.mjs"
cargo test --manifest-path "$ROOT/backend/Cargo.toml" application::ai::context::tests
cargo test --manifest-path "$ROOT/backend/Cargo.toml" application::ai::use_case::tests
cargo test --manifest-path "$ROOT/backend/Cargo.toml" operation_group_metadata_extends_the_envelope_not_the_operation

printf '%s\n' 'PASS - M5 deterministic gate: context budget, tool output constraints, completion postconditions, and operation-log group metadata'
