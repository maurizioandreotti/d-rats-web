#!/usr/bin/env python3
"""Minimal WebSocket echo server for testing browser connectivity."""
import asyncio, hashlib, base64, struct

GUID = b'258EAFA5-E914-47DA-95CA-5AB5F737AA46'

def accept_key(key: str) -> str:
    return base64.b64encode(hashlib.sha1(key.encode() + GUID).digest()).decode()

class WSFrame:
    @staticmethod
    def encode(data: bytes, opcode: int = 2) -> bytes:
        f = bytearray()
        f.append(0x80 | opcode)
        n = len(data)
        if n < 126: f.append(n)
        elif n < 65536:
            f.extend([126, *struct.pack('>H', n)])
        else:
            f.extend([127, *struct.pack('>Q', n)])
        f.extend(data)
        return bytes(f)

    @staticmethod
    async def read(reader):
        try:
            b1, b2 = await reader.readexactly(1), await reader.readexactly(1)
        except:
            return None
        op = b1[0] & 0x0F
        masked = bool(b2[0] & 0x80)
        n = b2[0] & 0x7F
        if n == 126: n = struct.unpack('>H', await reader.readexactly(2))[0]
        elif n == 127: n = struct.unpack('>Q', await reader.readexactly(8))[0]
        mk = await reader.readexactly(4) if masked else b''
        p = await reader.readexactly(n)
        if masked: p = bytes(b ^ mk[i % 4] for i, b in enumerate(p))
        return op, p

async def handle(reader, writer):
    p = writer.get_extra_info('peername')
    print(f'[test] connect {p}')
    
    req = b''
    while b'\r\n\r\n' not in req:
        c = await reader.read(4096)
        if not c: return
        req += c
    
    hdrs = {}
    for line in req.decode().split('\r\n')[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            hdrs[k.strip().lower()] = v.strip()
    
    key = hdrs.get('sec-websocket-key', '')
    if not key:
        writer.write(b'HTTP/1.1 400\r\n\r\nno key')
        await writer.drain()
        return
    
    accept = accept_key(key)
    resp = (
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n'
        '\r\n'
    )
    writer.write(resp.encode())
    await writer.drain()
    print(f'[test] upgrade OK  key={key[:16]}...  accept={accept[:16]}...')

    writer.write(WSFrame.encode(b'CONNECTED', opcode=2))
    await writer.drain()

    while True:
        f = await WSFrame.read(reader)
        if f is None:
            print(f'[test] disconnect')
            break
        op, payload = f
        if op == 8:
            print(f'[test] close frame')
            break
        elif op == 9:
            writer.write(WSFrame.encode(payload, opcode=10))
            await writer.drain()
        elif op in (1, 2):
            print(f'[test] echo {len(payload)}b')
            writer.write(WSFrame.encode(payload, opcode=op))
            await writer.drain()
    writer.close()

async def main():
    srv = await asyncio.start_server(handle, '0.0.0.0', 9002)
    print(f'[test] Listening on 0.0.0.0:9002')
    print(f'[test] Test from browser console:')
    print(f'  let ws=new WebSocket("ws://127.0.0.1:9002/")')
    print(f'  ws.binaryType="arraybuffer"')
    print(f'  ws.onopen=()=>console.log("TEST: OPEN")')
    print(f'  ws.onmessage=(e)=>console.log("TEST:",new TextDecoder().decode(e.data))')
    print(f'  ws.onerror=()=>console.log("TEST: ERROR")')
    print(f'  ws.onclose=(e)=>console.log("TEST: CLOSE",e.code,e.reason)')
    async with srv:
        await srv.serve_forever()

asyncio.run(main())
