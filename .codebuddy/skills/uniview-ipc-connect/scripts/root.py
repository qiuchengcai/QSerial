#!/usr/bin/env python3
"""Layer 2 root shell access for Uniview IPC device."""

import sys
import os
import subprocess
import re
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connect import Connection, clean_output, recv_until

# Ctrl+B sequence used after 'uniview' command to trigger Layer 2 login
CTRL_B = b'\x02\x01'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
A_TOOL = os.path.join(SCRIPT_DIR, 'a')

# Cached serial number
_cached_serial = None


def get_serial_number(conn):
    """Get device serial number via manuinfotool."""
    output = conn.send_command('manuinfotool')
    match = re.search(r'DEVICE_SERIAL_NUMBER[:\s]*([A-Za-z0-9]+)', output)
    if not match:
        match = re.search(r'Serial\s*Number[:\s]*([A-Za-z0-9]+)', output)
    if not match:
        match = re.search(r'序列号[:\s：]*([A-Za-z0-9]+)', output)
    if match:
        return match.group(1)
    raise RuntimeError(f"Could not find serial number in output: {output[:300]}")


def generate_password(serial_number):
    """Generate Layer 2 password using the 'a' tool."""
    result = subprocess.run([A_TOOL, serial_number], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Password generation failed: {result.stderr}")

    ansi_escape = re.compile(r'\x1b\[[0-9;]*m')
    for line in result.stdout.split('\n'):
        clean_line = ansi_escape.sub('', line)
        match = re.search(r'打开调试因子\+默认时间:\s*(\S+)', clean_line)
        if match:
            return match.group(1)

    raise RuntimeError(f"Could not parse password from output: {result.stdout[:300]}")


def enter_layer2(conn, password):
    """Enter Layer 2 shell from Layer 1."""
    conn.sock.sendall(b'uniview\x02\x01\r\n')
    time.sleep(1)

    text = recv_until(conn.sock, r'word[:：]', timeout=10, respond_iac=True)
    clean = clean_output(text)

    if 'word' not in clean.lower():
        raise RuntimeError(f"Expected password prompt, got: {clean[:200]}")

    conn.sock.sendall((password + '\r\n').encode())
    time.sleep(1)

    text = recv_until(conn.sock, r'[#\$]', timeout=10, respond_iac=True)
    clean = clean_output(text)

    if '#' not in clean and '$' not in clean:
        raise RuntimeError(f"Failed to enter Layer 2, got: {clean[:200]}")

    return True


def ensure_layer2(conn):
    """Ensure we are at Layer 2. If at Layer 1, enter Layer 2 automatically.
    If already at Layer 2, do nothing.
    """
    # Send Enter to check current prompt
    conn.sock.sendall(b'\r\n')
    text = recv_until(conn.sock, r'(User@|>|[#\$])', timeout=5, respond_iac=True)
    clean = clean_output(text)

    # Already at Layer 2
    if '#' in clean or '$' in clean:
        return

    # At Layer 1, need to enter Layer 2
    global _cached_serial
    if not _cached_serial:
        _cached_serial = get_serial_number(conn)
    password = generate_password(_cached_serial)
    enter_layer2(conn, password)


def main():
    global _cached_serial
    serial_number = None
    if len(sys.argv) >= 3 and sys.argv[1] == '--serial':
        serial_number = sys.argv[2]
        cmd_args = sys.argv[3:]
    else:
        cmd_args = sys.argv[1:]

    if serial_number:
        _cached_serial = serial_number

    with Connection() as conn:
        ensure_layer2(conn)

        if not cmd_args:
            # Interactive mode
            print("Connected to Layer 2 root shell. Type 'exit' to quit.")
            while True:
                try:
                    cmd = input("root@root:~$ ").strip()
                    if cmd.lower() == 'exit':
                        break
                    if not cmd:
                        continue
                    conn.sock.sendall((cmd + '\r\n').encode())
                    text = recv_until(conn.sock, r'[#\$]', timeout=15, respond_iac=True)
                    lines = clean_output(text).split('\n')
                    if lines and cmd in lines[0]:
                        lines = lines[1:]
                    print('\n'.join(lines))
                except (EOFError, KeyboardInterrupt):
                    break
        else:
            # Single command mode
            cmd = ' '.join(cmd_args)
            conn.sock.sendall((cmd + '\r\n').encode())
            text = recv_until(conn.sock, r'[#\$]', timeout=15, respond_iac=True)
            lines = clean_output(text).split('\n')
            if lines and cmd in lines[0]:
                lines = lines[1:]
            print('\n'.join(lines))


if __name__ == '__main__':
    main()
