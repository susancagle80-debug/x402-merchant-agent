# Project Instructions

## Shell Command Policy
- All `run_shell_command` executions MUST be wrapped with a `timeout` utility to enforce a maximum execution time.
- The maximum allowed execution time is 300 seconds (5 minutes).
- Usage: `timeout 300 <command>`
