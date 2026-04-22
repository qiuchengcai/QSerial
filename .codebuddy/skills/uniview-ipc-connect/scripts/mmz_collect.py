#!/usr/bin/env python3
"""Collect MMZ information from device in a single session."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connect import Connection, clean_output, recv_until
from root import get_serial_number, generate_password, enter_layer2

SERIAL = '210235CB3N0471956830'

COMMANDS = [
    "cat /proc/umap/media-mem",
    "cat /proc/umap/mmz",
    "cat /proc/umap/vb",
    "ls /proc/umap/",
    "cat /proc/meminfo",
    "cat /proc/cmdline",
    "cat /proc/umap/sys",
    "cat /proc/umap/vi",
    "cat /proc/umap/vpss",
    "cat /proc/umap/venc",
    "cat /proc/umap/vda",
    "cat /proc/umap/region",
    "cat /proc/umap/vo",
    "cat /proc/umap/hdmi",
    "free -m",
    "cat /proc/version",
    "ls /program/lib/",
]

def main():
    results = {}
    with Connection(target_layer=2) as conn:
        # Ensure we are at Layer 2
        conn.sock.sendall(b'\r\n')
        text = recv_until(conn.sock, r'(User@|>|[#\$])', timeout=5, respond_iac=True)
        clean = clean_output(text)
        at_layer2 = '#' in clean or '$' in clean

        if not at_layer2:
            # At Layer 1, enter Layer 2
            password = generate_password(SERIAL)
            enter_layer2(conn, password)

        for cmd in COMMANDS:
            print(f"[CMD] {cmd}", file=sys.stderr)
            conn.sock.sendall((cmd + '\r\n').encode())
            try:
                text = recv_until(conn.sock, r'[#\$]', timeout=8, respond_iac=True)
                output = clean_output(text)
                # Remove command echo from first line
                lines = output.split('\n')
                if lines and cmd in lines[0]:
                    lines = lines[1:]
                # Remove prompt from last line
                if lines and ('root@' in lines[-1] or '$' in lines[-1]):
                    lines = lines[:-1]
                results[cmd] = '\n'.join(lines).strip()
            except Exception as e:
                results[cmd] = f"[ERROR] {e}"

    # Output all results
    for cmd, output in results.items():
        print(f"=== {cmd} ===")
        print(output)
        print()

if __name__ == '__main__':
    main()
