#!/usr/bin/env python3
"""
ratflector-bridge.py - WebSocket-to-TCP bridge for D-RATS ratflector.

Ratflector servers use raw TCP, but browsers can only use WebSocket.
This bridge translates between the two.

Usage:
  python3 ratflector-bridge.py [--port 9001]

The D-RATS Web app connects to ws://localhost:9001/?host=HOST&port=PORT
This bridge opens a raw TCP connection to HOST:PORT and proxies all data
bidirectionally between the WebSocket and the TCP socket.
"""

import asyncio
import hashlib
import base64
import struct
import hmac
import os
import sys

WEBSOCKET_GUID = b'258EAFA5-E914-47DA-95CA-5AB5F737AA46'
BUF_SIZE = 65536


def create_accept_key(key: str) -> str:
    sha1 = hashlib.sha1(key.encode() + WEBSOCKET_GUID).digest()
    return base64.b64encode(sha1).decode()


class WebSocketFrame:
    @staticmethod
    def encode(data: bytes, opcode: int = 2) -> bytes:
        frame = bytearray()
        frame.append(0x80 | opcode)
        length = len(data)
        if length < 126:
            frame.append(length)
        elif length < 65536:
            frame.append(126)
            frame.extend(struct.pack('>H', length))
        else:
            frame.append(127)
            frame.extend(struct.pack('>Q', length))
        frame.extend(data)
        return bytes(frame)

    @staticmethod
    async def read_frame(reader: asyncio.StreamReader) -> tuple[int, bytes] | None:
        try:
            b1 = await reader.readexactly(1)
        except (asyncio.IncompleteReadError, ConnectionError):
            return None
        opcode = b1[0] & 0x0F
        fin = bool(b1[0] & 0x80)

        try:
            b2 = await reader.readexactly(1)
        except (asyncio.IncompleteReadError, ConnectionError):
            return None
        masked = bool(b2[0] & 0x80)
        length = b2[0] & 0x7F

        if length == 126:
            raw = await reader.readexactly(2)
            length = struct.unpack('>H', raw)[0]
        elif length == 127:
            raw = await reader.readexactly(8)
            length = struct.unpack('>Q', raw)[0]

        mask_key = b''
        if masked:
            mask_key = await reader.readexactly(4)

        payload = await reader.readexactly(length)
        if masked:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

        return opcode, payload


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    """Handle a single WebSocket client connection."""
    peername = writer.get_extra_info('peername')
    print(f'[bridge] Client connected: {peername}')

    try:
        # Read HTTP upgrade request
        request = b''
        while b'\r\n\r\n' not in request:
            chunk = await reader.read(4096)
            if not chunk:
                print(f'[bridge] Client disconnected during handshake: {peername}')
                return
            request += chunk

        request_text = request.decode('utf-8', 'replace')
        lines = request_text.split('\r\n')

        # Parse request line and headers
        first_line = lines[0] if lines else ''
        headers = {}
        for line in lines[1:]:
            if ':' in line:
                k, v = line.split(':', 1)
                headers[k.strip().lower()] = v.strip()

        # Parse query params from GET path
        path = first_line.split(' ')[1] if len(first_line.split(' ')) > 1 else '/'
        from urllib.parse import urlparse, parse_qs
        params = parse_qs(urlparse(path).query)

        target_host = (params.get('host') or [''])[0]
        target_port_str = (params.get('port') or [''])[0]

        if not target_host or not target_port_str:
            writer.write(b'HTTP/1.1 400 Bad Request\r\n\r\nMissing host/port query params\r\n')
            await writer.drain()
            return

        target_port = int(target_port_str)

        # WebSocket upgrade response
        ws_key = headers.get('sec-websocket-key', '')
        if not ws_key:
            writer.write(b'HTTP/1.1 400 Bad Request\r\n\r\nNot a WebSocket request\r\n')
            await writer.drain()
            return

        accept = create_accept_key(ws_key)
        response = (
            'HTTP/1.1 101 Switching Protocols\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Accept: {accept}\r\n'
            '\r\n'
        )
        writer.write(response.encode())
        await writer.drain()

        print(f'[bridge] WebSocket upgrade OK for {peername}  accept={accept[:16]}...')
        await asyncio.sleep(0.05)

        print(f'[bridge] Connecting TCP to {target_host}:{target_port}...')

        # Connect to target ratflector via raw TCP
        try:
            tcp_reader, tcp_writer = await asyncio.wait_for(
                asyncio.open_connection(target_host, target_port),
                timeout=10
            )
        except (asyncio.TimeoutError, ConnectionError, OSError) as e:
            print(f'[bridge] TCP connection failed to {target_host}:{target_port}: {e}')
            err_frame = WebSocketFrame.encode(
                f'ERROR: Cannot connect to {target_host}:{target_port} - {e}'.encode(),
                opcode=1
            )
            writer.write(err_frame)
            await writer.drain()
            writer.write(WebSocketFrame.encode(b'', opcode=8))
            await writer.drain()
            return

        print(f'[bridge] Connected TCP to {target_host}:{target_port}')

        # Immediately forward any data already received from TCP
        # (the welcome message arrives before ws_to_tcp starts reading)
        try:
            first_data = await asyncio.wait_for(tcp_reader.read(BUF_SIZE), timeout=5)
            if first_data:
                print(f'[bridge] TCP->WS (immediate) {len(first_data)} bytes: {first_data[:60]!r}')
                frame = WebSocketFrame.encode(first_data, opcode=2)
                writer.write(frame)
                await writer.drain()
        except asyncio.TimeoutError:
            print(f'[bridge] No immediate TCP data (timeout)')
        except ConnectionError as e:
            print(f'[bridge] TCP read error: {e}')

        async def ws_to_tcp():
            """Forward WebSocket data to TCP."""
            try:
                while True:
                    frame = await WebSocketFrame.read_frame(reader)
                    if frame is None:
                        print(f'[bridge] WebSocket read_frame returned None (client disconnected)')
                        break
                    opcode, payload = frame
                    if opcode == 8:  # Close
                        code = struct.unpack('>H', payload[:2])[0] if len(payload) >= 2 else 1005
                        reason = payload[2:].decode('utf-8', 'replace') if len(payload) > 2 else ''
                        print(f'[bridge] WebSocket close from client: code={code} reason={reason!r}')
                        break
                    elif opcode == 9:  # Ping
                        pong = WebSocketFrame.encode(payload, opcode=10)
                        writer.write(pong)
                        await writer.drain()
                    elif opcode in (1, 2):  # Text or Binary
                        print(f'[bridge] WS->TCP {len(payload)} bytes: {payload[:50]!r}')
                        tcp_writer.write(payload)
                        await tcp_writer.drain()
            except (ConnectionError, asyncio.CancelledError) as e:
                print(f'[bridge] ws_to_tcp exception: {e}')
            except Exception as e:
                print(f'[bridge] ws_to_tcp unexpected: {e}')
            finally:
                try:
                    tcp_writer.close()
                except:
                    pass

        async def tcp_to_ws():
            """Forward TCP data to WebSocket."""
            try:
                while True:
                    data = await tcp_reader.read(BUF_SIZE)
                    if not data:
                        print(f'[bridge] TCP connection closed by remote')
                        break
                    print(f'[bridge] TCP->WS {len(data)} bytes: {data[:50]!r}')
                    frame = WebSocketFrame.encode(data, opcode=2)
                    writer.write(frame)
                    await writer.drain()
            except (ConnectionError, asyncio.CancelledError) as e:
                print(f'[bridge] tcp_to_ws exception: {e}')
            except Exception as e:
                print(f'[bridge] tcp_to_ws unexpected: {e}')
            finally:
                try:
                    writer.write(WebSocketFrame.encode(b'', opcode=8))
                    await writer.drain()
                except:
                    pass

        # Run both directions concurrently
        await asyncio.gather(ws_to_tcp(), tcp_to_ws())

    except Exception as e:
        print(f'[bridge] Error for {peername}: {e}')
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except:
            pass
        print(f'[bridge] Client disconnected: {peername}')


async def main():
    import argparse
    parser = argparse.ArgumentParser(description='ratflector WebSocket-to-TCP bridge')
    parser.add_argument('--port', type=int, default=9001, help='Listen port (default: 9001)')
    parser.add_argument('--host', default='0.0.0.0', help='Listen address (default: 0.0.0.0 — needed for WSL)')
    args = parser.parse_args()

    # Workaround for urllib.parse not being imported at top level
    global urlparse, parse_qs
    from urllib.parse import urlparse, parse_qs

    server = await asyncio.start_server(handle_client, args.host, args.port)
    addr = server.sockets[0].getsockname()
    print(f'[bridge] ratflector-bridge listening on {addr[0]}:{addr[1]}')
    print(f'[bridge] Configure D-RATS Web to use ws://localhost:{args.port}/ as bridge URL')
    print('[bridge] Press Ctrl+C to stop')

    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n[bridge] Stopped')
