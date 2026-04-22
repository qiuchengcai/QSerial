#!/usr/bin/env python3
"""Base connection module for Uniview IPC device via QSerial."""

import socket
import time
import sys
import re
import struct
import fcntl
import os

# TELNET protocol constants
IAC = b'\xff'
DONT = b'\xfe'
DO = b'\xfd'
WONT = b'\xfc'
WILL = b'\xfb'
SB = b'\xfa'
SE = b'\xf0'
SUPPRESS_GO_AHEAD = b'\x03'
ECHO = b'\x01'
NAWS = b'\x1f'
TTYPE = b'\x18'
LINEMODE = b'\x22'
NEW_ENVIRON = b'\x27'

QSERIAL_HOST = '10.188.42.148'
QSERIAL_PORT = 8888
QSERIAL_PASSWORD = 'Admin123.'

DEVICE_USER = 'root'
DEVICE_PASSWORD = 'Admin123.'

# Lock file to prevent concurrent QSerial connections (single serial port)
_LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.qserial.lock')


def _respond_iac(sock, data):
    """Parse IAC commands from data and send appropriate responses.

    This should only be called AFTER QSerial authentication is complete.
    Before authentication, do NOT respond to IAC to avoid negotiation loops.
    """
    i = 0
    while i < len(data):
        if data[i] == 0xFF and i + 2 < len(data):
            cmd = data[i+1]
            opt = data[i+2]
            if cmd == 0xFD:  # DO
                if opt == 0x1F:  # NAWS
                    sock.sendall(IAC + WILL + NAWS)
                    sock.sendall(IAC + SB + NAWS + struct.pack('>HH', 80, 24) + IAC + SE)
                elif opt == 0x18:  # TTYPE
                    sock.sendall(IAC + WILL + TTYPE)
                    sock.sendall(IAC + SB + TTYPE + b'\x00' + b'xterm' + IAC + SE)
                elif opt in (0x01, 0x03):  # ECHO, SGA
                    sock.sendall(IAC + WILL + bytes([opt]))
                else:
                    sock.sendall(IAC + WONT + bytes([opt]))
            elif cmd == 0xFB:  # WILL
                if opt in (0x01, 0x03):  # ECHO, SGA
                    sock.sendall(IAC + DO + bytes([opt]))
                else:
                    sock.sendall(IAC + DONT + bytes([opt]))
            elif cmd == 0xFE:  # DONT
                sock.sendall(IAC + WONT + bytes([opt]))
            elif cmd == 0xFC:  # WONT
                sock.sendall(IAC + DONT + bytes([opt]))
            i += 3
        else:
            i += 1


def recv_until(sock, pattern, timeout=10, respond_iac=False):
    """Receive data until pattern is found or timeout.

    If respond_iac is True, respond to TELNET IAC commands to prevent loops.
    """
    buf = b''
    end_time = time.time() + timeout
    while time.time() < end_time:
        try:
            sock.settimeout(1)
            data = sock.recv(4096)
            if not data:
                break
            buf += data
            if respond_iac:
                _respond_iac(sock, data)
            text = buf.decode('utf-8', errors='replace')
            if re.search(pattern, text):
                return text
        except socket.timeout:
            continue
    return buf.decode('utf-8', errors='replace')


def clean_output(text):
    """Remove TELNET control sequences and ANSI escape codes."""
    # Remove IAC SB ... IAC SE subnegotiation first
    text = re.sub(r'\xff\xfa.*?\xff\xf0', '', text, flags=re.DOTALL)
    # Remove IAC + cmd + opt (3 bytes)
    text = re.sub(r'\xff[\xfb\xfc\xfd\xfe](.)', '', text)
    # Remove IAC IAC (escaped 0xff)
    text = re.sub(r'\xff\xff', '\xff', text)
    # Remove ANSI escape codes
    text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)
    # Remove control characters except newline/tab
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text


class Connection:
    """Manages connection to QSerial and device shell.

    Parameters:
        target_layer: 1 or 2, which shell layer to connect to. Default is 2.
    """

    def __init__(self, host=QSERIAL_HOST, port=QSERIAL_PORT,
                 qserial_password=QSERIAL_PASSWORD,
                 device_user=DEVICE_USER, device_password=DEVICE_PASSWORD,
                 target_layer=2):
        self.host = host
        self.port = port
        self.qserial_password = qserial_password
        self.device_user = device_user
        self.device_password = device_password
        self.target_layer = target_layer
        self.sock = None
        self._lock_fd = None

    def connect(self):
        """Establish connection: TCP -> QSerial auth -> reach target layer.

        Acquires an exclusive file lock to prevent concurrent QSerial connections,
        which would corrupt the serial session and waste Layer 2 password attempts.

        After QSerial auth, detects current layer and navigates to target_layer:
        - If target_layer=1 and at L2: send 'exit' to go back to L1
        - If target_layer=2 and at L1: caller should use root.enter_layer2()
        - If already at target layer: stay
        Close does NOT exit the shell, so device stays at whatever layer it's on.
        """
        # Acquire exclusive lock to prevent concurrent QSerial access
        self._lock_fd = open(_LOCK_FILE, 'w')
        try:
            fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, OSError):
            print("ERROR: Another session is using the QSerial port. Waiting...",
                  file=sys.stderr)
            fcntl.flock(self._lock_fd, fcntl.LOCK_EX)  # Block until available
            print("Lock acquired, proceeding...", file=sys.stderr)

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(10)
        self.sock.connect((self.host, self.port))

        # Phase 1: Wait for text prompt from QSerial
        # QSerial may show PASSWORD prompt or directly show device login
        # We need to handle IAC but avoid negotiation loops
        # Strategy: read all data with timeout, don't respond to IAC during Phase 1
        buf = b''
        end_time = time.time() + 10
        while time.time() < end_time:
            try:
                self.sock.settimeout(1)
                data = self.sock.recv(4096)
                if not data:
                    break
                buf += data
            except socket.timeout:
                # Check if we have enough text to identify prompt
                text = buf.decode('utf-8', errors='replace')
                clean = clean_output(text)
                if 'PASSWORD' in clean.upper() or 'login' in clean.lower() or 'root@' in clean or 'User@' in clean:
                    break
                # If we have some text but no known prompt, try sending Enter
                if len(clean.strip()) > 0 and time.time() > end_time - 5:
                    self.sock.sendall(b'\r\n')
                continue

        text = buf.decode('utf-8', errors='replace')
        clean = clean_output(text)

        if 'PASSWORD' in clean.upper():
            # QSerial requires authentication
            self.sock.sendall((self.qserial_password + '\r\n').encode())
            time.sleep(1)

            # After authentication, send Enter to trigger device prompt
            self.sock.sendall(b'\r\n')
            text = recv_until(self.sock, r'(login[:：]|User@|>|[#\$])', timeout=15, respond_iac=True)
            clean = clean_output(text)
        elif 'login' in clean.lower():
            # QSerial already authenticated, directly at device login
            pass
        elif 'root@' in clean or 'User@' in clean:
            # Already at device shell (Layer 1 or Layer 2)
            pass
        else:
            raise ConnectionError(
                f"Expected PASSWORD or login prompt, got: {clean[:200]}")

        # If login prompt, send credentials
        if 'login' in clean.lower():
            self.sock.sendall((self.device_user + '\r\n').encode())
            time.sleep(0.5)
            text = recv_until(self.sock, r'[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd][:：]', timeout=5, respond_iac=True)
            self.sock.sendall((self.device_password + '\r\n').encode())
            time.sleep(1)
            text = recv_until(self.sock, r'(User@|>|[#\$])', timeout=10, respond_iac=True)
            clean = clean_output(text)

        # Detect current layer and navigate if needed
        at_layer2 = bool(re.search(r'[#\$]', clean))
        at_layer1 = 'User@' in clean or '>' in clean

        if self.target_layer == 1 and at_layer2:
            # At L2, need to go back to L1
            self.sock.sendall(b'exit\r\n')
            time.sleep(0.5)
            text = recv_until(self.sock, r'(User@|>)', timeout=5, respond_iac=True)
            clean = clean_output(text)
            at_layer1 = 'User@' in clean or '>' in clean

        if self.target_layer == 1 and not at_layer1:
            raise ConnectionError(f"Failed to reach Layer 1, got: {clean[:200]}")
        if self.target_layer == 2 and not at_layer2 and not at_layer1:
            raise ConnectionError(f"Failed to reach device shell, got: {clean[:200]}")

        return True

    def send_command(self, cmd, wait_pattern=r'(User@|>|[#\$])', timeout=10):
        """Send a command and wait for response."""
        self.sock.sendall((cmd + '\r\n').encode())
        text = recv_until(self.sock, wait_pattern, timeout=timeout, respond_iac=True)
        return clean_output(text)

    def close(self):
        """Close connection without changing device shell state."""
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        if self._lock_fd:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                self._lock_fd.close()
            except Exception:
                pass
            self._lock_fd = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *args):
        self.close()
