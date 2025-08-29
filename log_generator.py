import os
import time
import random
import threading
from datetime import datetime

# ==============================
# 可调参数
# ==============================
LOG_DIR = os.path.expanduser("~/splunk_logs")
LOG_FILE = os.path.join(LOG_DIR, "apache_access.log")

BACKGROUND_EPS = 2.0                 # 背景流量（每秒事件数）
BURST_EPS = 18.0                     # 攻击突发时速率（每秒事件数）
BURST_DURATION_RANGE = (8, 15)       # 每次突发持续 8-15 秒
BURST_GAP_RANGE = (30, 60)           # 两次突发间隔 30-60 秒

BACKGROUND_STATUS = [200, 200, 200, 200, 404, 500]
BURST_STATUS = [403, 403, 403, 404, 200]  # 攻击期以 403/404 为主

USER_AGENTS = [
    "Mozilla/5.0", "curl/7.64.1", "PostmanRuntime/7.32.2",
    "Chrome/119.0", "Safari/604.1"
]
URLS_NORMAL = ["/", "/index.html", "/api/data", "/favicon.ico", "/dashboard"]
URLS_ATTACK = ["/login", "/admin"]

# ==============================

def apache_now():
    return datetime.now().strftime("%d/%b/%Y:%H:%M:%S %z")

def rand_ip():
    return ".".join(str(random.randint(1, 254)) for _ in range(4))

def write_line(f, ip, url, status):
    line = f'{ip} - - [{apache_now()}] "GET {url} HTTP/1.1" {status} {random.randint(200,5000)} "-" "{random.choice(USER_AGENTS)}"\n'
    f.write(line)
    f.flush()
    print(line.strip())

def input_worker(trigger_event):
    """
    在独立线程里等待用户按回车 ↩︎，手动触发一次攻击突发。
    """
    try:
        while True:
            _ = input("Press <Enter> to TRIGGER an attack burst now...\n")
            trigger_event.set()
    except Exception:
        # 终止时退出线程
        return

def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    print(f"Generating logs into {LOG_FILE} (Ctrl+C to stop).")
    print("Tip: 刷新不足？把 BACKGROUND_EPS / BURST_EPS 调大；或缩短 BURST_GAP_RANGE。")

    background_sleep = max(0.01, 1.0 / BACKGROUND_EPS)
    burst_sleep = max(0.01, 1.0 / BURST_EPS)

    manual_trigger = threading.Event()
    t = threading.Thread(target=input_worker, args=(manual_trigger,), daemon=True)
    t.start()

    next_burst_start = time.time() + random.uniform(*BURST_GAP_RANGE)
    burst_ip = None
    burst_end_ts = 0.0

    with open(LOG_FILE, "a") as f:
        while True:
            now = time.time()

            # 手动触发：立即开始一轮突发
            if manual_trigger.is_set() and burst_ip is None:
                burst_ip = rand_ip()
                dur = random.uniform(*BURST_DURATION_RANGE)
                burst_end_ts = now + dur
                manual_trigger.clear()
                print(f"=== [Manual Attack Burst START] {burst_ip} for {dur:.1f}s ===")

            # 定时触发
            if burst_ip is None and now >= next_burst_start:
                burst_ip = rand_ip()
                dur = random.uniform(*BURST_DURATION_RANGE)
                burst_end_ts = now + dur
                print(f"=== [Scheduled Attack Burst START] {burst_ip} for {dur:.1f}s ===")

            if burst_ip and now < burst_end_ts:
                # 攻击期：固定 IP，高速生成 403/404
                write_line(f, burst_ip, random.choice(URLS_ATTACK), random.choice(BURST_STATUS))
                time.sleep(burst_sleep)
            else:
                # 攻击结束 or 正常期：背景流量
                if burst_ip and now >= burst_end_ts:
                    print(f"=== [Attack Burst END] {burst_ip} ===")
                    burst_ip = None
                    next_burst_start = now + random.uniform(*BURST_GAP_RANGE)

                write_line(f, rand_ip(), random.choice(URLS_NORMAL), random.choice(BACKGROUND_STATUS))
                time.sleep(background_sleep)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")