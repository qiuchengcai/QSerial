#!/usr/bin/env python3
"""Layer 1 shell access for Uniview IPC device."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connect import Connection


def main():
    if len(sys.argv) < 2:
        # Interactive mode
        with Connection() as conn:
            print("Connected to Layer 1 shell. Type 'exit' to quit.")
            while True:
                try:
                    cmd = input("User@/root> ").strip()
                    if cmd.lower() == 'exit':
                        break
                    if not cmd:
                        continue
                    output = conn.send_command(cmd)
                    # Remove the command echo from output
                    lines = output.split('\n')
                    if lines and cmd in lines[0]:
                        lines = lines[1:]
                    print('\n'.join(lines))
                except (EOFError, KeyboardInterrupt):
                    break
    else:
        # Single command mode
        cmd = ' '.join(sys.argv[1:])
        with Connection() as conn:
            output = conn.send_command(cmd)
            lines = output.split('\n')
            if lines and cmd in lines[0]:
                lines = lines[1:]
            print('\n'.join(lines))


if __name__ == '__main__':
    main()
