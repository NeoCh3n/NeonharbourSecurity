import os
import time
import random
from datetime import datetime

# 日志文件路径（可改）
log_dir = os.path.expanduser("~/splunk_logs")
log_file = os.path.join(log_dir, "apache_access.log")

# 确保目录存在
os.makedirs(log_dir, exist_ok=True)

# 常见 User-Agent 列表
user_agents = [
    "Mozilla/5.0",
    "curl/7.64.1",
    "PostmanRuntime/7.32.2",
    "Chrome/119.0",
    "Safari/604.1"
]

# 常见 URL 路径
urls = ["/", "/login", "/index.html", "/admin", "/api/data", "/favicon.ico"]

# 状态码分布：200 多，403/404 偶尔，500 很少
status_choices = [200, 200, 200, 200, 404, 403, 500]

print(f"Generating logs into {log_file} (Ctrl+C to stop)...")

with open(log_file, "a") as f:
    while True:
        ip = ".".join(str(random.randint(1, 254)) for _ in range(4))
        now = datetime.now().strftime("%d/%b/%Y:%H:%M:%S %z")
        url = random.choice(urls)
        status = random.choice(status_choices)
        bytes_sent = random.randint(200, 5000)
        agent = random.choice(user_agents)

        log_line = f'{ip} - - [{now}] "GET {url} HTTP/1.1" {status} {bytes_sent} "-" "{agent}"\n'
        f.write(log_line)
        f.flush()

        print(log_line.strip())  # 控制台也显示
        time.sleep(1)  # 每秒一条，可改成 0.1 更快