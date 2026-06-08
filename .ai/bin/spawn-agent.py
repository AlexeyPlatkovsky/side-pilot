#!/usr/bin/env python3
"""spawn-agent.py — Spawn a side-pilot agent via the appropriate CLI.

Usage:
    spawn-agent.py <name> [--input <path>] [--output <path>] [--timeout <sec>]

Exit codes:
    0  — Agent completed, output produced
    1  — Agent completed but output is empty or indicates failure
    2  — Timeout (agent did not finish within the limit)
    3  — Infrastructure error (agent file not found, CLI not available, parse error)
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time

# ── Config (tweak these) ──────────────────────────────────────────────────────
POLL_INTERVAL = 10       # seconds between process-alive checks
DEFAULT_TIMEOUT = 600    # seconds (10 min)
STDERR_LOG = "/tmp/spawn-agent-stderr.log"


def parse_frontmatter(text):
    """Parse YAML frontmatter from a markdown file. Returns (fields_dict, body)."""
    match = re.match(r'^---\s*\n(.*?)\n\s*---\s*\n?(.*)', text, re.DOTALL)
    if not match:
        return {}, text
    yaml_block = match.group(1)
    body = match.group(2).lstrip()
    fields = {}
    for line in yaml_block.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' in line:
            key, _, val = line.partition(':')
            fields[key.strip()] = val.strip()
    return fields, body


def resolve_agent_path(name):
    """Search for agent file in project and user locations."""
    paths = [
        f'.ai/agents/{name}.md',
        os.path.expanduser(f'~/.ai/agents/{name}.md'),
    ]
    for p in paths:
        if os.path.isfile(p):
            return os.path.abspath(p)
    return None


def check_cli(cli):
    """Ensure the required CLI is available on PATH."""
    binary = {'claude': 'claude', 'codex': 'codex', 'opencode': 'opencode'}.get(cli)
    if not binary:
        print(f"Error: unknown CLI '{cli}'", file=sys.stderr)
        sys.exit(3)
    if not shutil.which(binary):
        print(f"Error: '{binary}' not found on PATH", file=sys.stderr)
        sys.exit(3)


def build_cmd(cli, model, effort, prompt):
    """Build the subprocess command list for the given CLI."""
    if cli == 'claude':
        return [
            'claude', '-p', prompt,
            '--model', model,
            '--effort', effort,
            '--dangerously-skip-permissions',
        ]
    elif cli == 'codex':
        return [
            'codex', 'exec',
            '--sandbox', 'danger-full-access',
            '-m', model,
            '-c', f'model_reasoning_effort={effort}',
            prompt,
        ]
    elif cli == 'opencode':
        return [
            'opencode', 'run',
            '--dangerously-skip-permissions',
            '--model', model,
            '--variant', effort,
            prompt,
        ]
    raise ValueError(f"Unknown CLI: {cli}")


def main():
    parser = argparse.ArgumentParser(description='Spawn a side-pilot agent.')
    parser.add_argument('name', help='Agent name (e.g. test-runner)')
    parser.add_argument('--input', help='Path to input file with task context')
    parser.add_argument('--output', help='Path to write agent result')
    parser.add_argument('--timeout', type=int, default=DEFAULT_TIMEOUT,
                        help=f'Max runtime in seconds (default: {DEFAULT_TIMEOUT})')
    args = parser.parse_args()

    # ── 1. Resolve agent file ───────────────────────────────────────────────
    agent_path = resolve_agent_path(args.name)
    if not agent_path:
        print(f"Error: agent '{args.name}' not found in .ai/agents/", file=sys.stderr)
        sys.exit(3)

    with open(agent_path) as f:
        content = f.read()

    frontmatter, body = parse_frontmatter(content)

    cli = frontmatter.get('cli')
    model = frontmatter.get('model')
    effort = frontmatter.get('effort', 'medium')

    if not cli or not model:
        print(f"Error: agent '{args.name}' missing required frontmatter: "
              f"cli={cli!r}, model={model!r}", file=sys.stderr)
        sys.exit(3)

    check_cli(cli)

    prompt = body.strip()

    # ── 2. Build and run command ─────────────────────────────────────────────
    cmd = build_cmd(cli, model, effort, prompt)

    stderr_f = open(STDERR_LOG, 'a')
    stderr_f.write(f"\n--- [{time.strftime('%H:%M:%S')}] spawn-agent: {args.name} "
                   f"(cli={cli}, model={model}, effort={effort}) ---\n")
    stderr_f.flush()

    stdin_f = open(args.input) if args.input and os.path.isfile(args.input) else None

    proc = subprocess.Popen(cmd, stdin=stdin_f, stdout=subprocess.PIPE, stderr=stderr_f)

    # ── 3. Poll for completion ──────────────────────────────────────────────
    start = time.time()
    timed_out = False

    while True:
        ret = proc.poll()
        if ret is not None:
            break
        if time.time() - start > args.timeout:
            proc.kill()
            timed_out = True
            break
        time.sleep(POLL_INTERVAL)

    stdout, _ = proc.communicate()

    if stdin_f:
        stdin_f.close()
    stderr_f.close()

    if timed_out:
        print(f"Error: agent '{args.name}' timed out after {args.timeout}s", file=sys.stderr)
        sys.exit(2)

    # ── 4. Write output file ─────────────────────────────────────────────────
    output_text = stdout.decode('utf-8', errors='replace')

    if args.output:
        out_dir = os.path.dirname(args.output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(args.output, 'w') as f:
            f.write(output_text)

    # ── 5. Determine exit code ───────────────────────────────────────────────
    if proc.returncode != 0:
        sys.exit(1)

    if not output_text.strip():
        sys.exit(1)

    sys.exit(0)


if __name__ == '__main__':
    main()
