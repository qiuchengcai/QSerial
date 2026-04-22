#!/usr/bin/env python3
"""Run multiple commands on Layer 2 in a single session."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connect import Connection, clean_output, recv_until
from root import get_serial_number, generate_password, enter_layer2

CMDS = [
    "uname -a",
    "uptime",
    "free -m",
    "df -h",
    "ifconfig 2>/dev/null || ip addr",
    "cat /proc/cpuinfo | head -20",
    "ps",
    "mount",
    "logread | tail -30",
]

def main():
    with Connection() as conn:
        serial_number = get_serial_number(conn)
        password = generate_password(serial_number)
        enter_layer2(conn, password)

        for cmd in CMDS:
            print(f"\n{'='*50}")
            print(f">>> {cmd}")
            print('='*50)
            conn.sock.sendall((cmd + '\r\n').encode())
            text = recv_until(conn.sock, r'[#\$]', timeout=15, respond_iac=True)
            lines = clean_output(text).split('\n')
            if lines and cmd.split()[0] in lines[0]:
                lines = lines[1:]
            print('\n'.join(lines))

if __name__ == '__main__':
    main()
