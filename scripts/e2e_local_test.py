#!/usr/bin/env python3
"""One-click local E2E test for NeonHarbour Security."""

import argparse
import json
import os
import sys
import time
import subprocess
import webbrowser
from pathlib import Path

import requests
from dotenv import load_dotenv


def wait_for(url, condition, timeout=60, interval=2):
    """Poll a URL until condition(json) is True or timeout."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(url, timeout=5)
            data = resp.json()
            if condition(data):
                return data
        except Exception:
            pass
        time.sleep(interval)
    raise RuntimeError(f"Timeout waiting for {url}")


def main():
    parser = argparse.ArgumentParser(description="Run local end-to-end test")
    parser.add_argument("--backend", default="http://localhost:8080", help="Backend base URL")
    parser.add_argument("--frontend", default="http://localhost", help="Frontend base URL")
    parser.add_argument("--open-ui", action="store_true", help="Open frontend UI in default browser")
    parser.add_argument("--ui-check", action="store_true", help="Use Playwright to verify UI")
    args = parser.parse_args()

    env_path = Path('.env')
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()

    if not os.getenv('DEEPSEEK_API_KEY'):
        print('DEEPSEEK_API_KEY not set in .env; please provide it before running.')
        return 1

    start_time = time.time()

    # Start containers
    try:
        subprocess.run(["docker", "compose", "up", "-d", "--build"], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"Failed to start docker compose: {exc}")
        return 1

    backend = args.backend.rstrip('/')

    try:
        wait_for(f"{backend}/health", lambda d: d.get('status') == 'ok')
        details = wait_for(
            f"{backend}/health/details",
            lambda d: d.get('status') == 'ok'
            and d.get('ai', {}).get('provider') == 'deepseek'
            and d.get('ai', {}).get('configured')
            and not d.get('virustotal', {}).get('enabled')
        )
    except Exception as exc:
        print(f"Health check failed: {exc}")
        return 1

    session = requests.Session()
    email = "tester@example.com"
    password = "test123"

    try:
        r = session.post(f"{backend}/auth/register", json={"email": email, "password": password}, timeout=10)
        if r.status_code != 200:
            r = session.post(f"{backend}/auth/login", json={"email": email, "password": password}, timeout=10)
            r.raise_for_status()
        token = r.json().get('token')
        if not token:
            raise RuntimeError('Missing token in auth response')
    except Exception as exc:
        print(f"Authentication failed: {exc}")
        return 1

    headers = {"Authorization": f"Bearer {token}"}
    alert = {"source": "test", "event_id": "e1", "message": "login fail", "ip": "127.0.0.1"}

    try:
        r = session.post(f"{backend}/alerts/ingest", json=alert, headers=headers, timeout=10)
        r.raise_for_status()
        r = session.get(f"{backend}/alerts", headers=headers, timeout=10)
        r.raise_for_status()
        alerts = r.json().get('alerts', [])
        if not alerts:
            raise RuntimeError('No alerts returned')
        latest = alerts[0]
        alert_id = latest['id']
        r = session.get(f"{backend}/alerts/{alert_id}", headers=headers, timeout=10)
        r.raise_for_status()
        detail = r.json()
        if not (
            isinstance(detail.get('timeline'), list)
            and isinstance(detail.get('evidence'), list)
            and 'summary' in detail
            and 'severity' in detail
        ):
            raise RuntimeError('Alert detail missing required fields')
    except Exception as exc:
        print(f"Alert ingestion failed: {exc}")
        return 1

    if args.open_ui:
        try:
            webbrowser.open(args.frontend, new=2)
        except Exception:
            pass

    if args.ui_check:
        try:
            from playwright.sync_api import sync_playwright
        except Exception:
            print('Playwright not installed. Run `pip install playwright` and `playwright install --with-deps`.')
            return 1
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(args.frontend)
                page.fill('input[type="email"]', email)
                page.fill('input[type="password"]', password)
                page.click('button[type="submit"]')
                page.wait_for_selector(f'text={alert["message"]}', timeout=10000)
                browser.close()
        except Exception as exc:
            print(f'UI check failed: {exc}')
            return 1

    elapsed = time.time() - start_time
    print(json.dumps({
        "status": "success",
        "elapsed_sec": round(elapsed, 1),
        "alert_id": alert_id,
        "summary": detail.get('summary')
    }, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
