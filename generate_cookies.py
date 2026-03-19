"""
Ejecutar UNA VEZ en tu PC para generar las cookies de twikit.
Después copiar el output como secret TWIKIT_COOKIES en GitHub.

Uso:
    pip install twikit
    python generate_cookies.py
"""
import asyncio
import base64
import json
import twikit


async def main():
    username = input('Twitter usuario (sin @): ').strip()
    email    = input('Twitter email: ').strip()
    password = input('Twitter contraseña: ').strip()

    print('\nIniciando sesión...')
    client = twikit.Client('en-US')
    await client.login(auth_info_1=username, auth_info_2=email, password=password)
    client.save_cookies('twikit_cookies.json')
    print('✓ Login exitoso — cookies guardadas en twikit_cookies.json')

    with open('twikit_cookies.json', 'r', encoding='utf-8') as f:
        raw = f.read()

    encoded = base64.b64encode(raw.encode('utf-8')).decode('utf-8')
    print('\n' + '='*60)
    print('COPIÁ TODO EL TEXTO DE ABAJO como secret TWIKIT_COOKIES:')
    print('='*60)
    print(encoded)
    print('='*60)


asyncio.run(main())
