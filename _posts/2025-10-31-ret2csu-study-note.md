---
layout: post
title: "[PWN]ret2csu学习笔记"
date: 2025-10-31
categories: [PWN]
---
在实际操作中，常常很难在程序中找到特定的gadget，这时候就需要用到ret2csu技术了。

# 信息检查

使用checksec检查题目程序。

![ref1](/assets/images/2025-10-31-ret2csu-study-note/ref1.png)

使用ida反汇编。可以看到main函数里没有get，直到返回处才调用了一个vulnerable_function，函数里的返回处又调用了read，从标准输入中读512个无符号长长整数到容量为128的buf中，所以肯定是栈溢出，那么考虑溢出的ROP链的构造。

![ref3](/assets/images/2025-10-31-ret2csu-study-note/ref2.png)

![ref3](/assets/images/2025-10-31-ret2csu-study-note/ref3.png)

首先由于NX保护，ret2shellcode肯定不行了，然后来考虑ret2syscall和ret2libc，但是可以ROPgadget看到根本没有可以利用的gadget来pop rdi，那就也不行了。

![ref4](/assets/images/2025-10-31-ret2csu-study-note/ref4.png)

此时就涉及到更复杂的利用ret2csu。



# Ret2csu

在使用glibc的程序中，存在一个初始化libc的函数libc_csu_init，它的代码里存在一段对大量的寄存器的初始化，如下。
```assembly
.text:00000000004005A0                 public __libc_csu_init
.text:00000000004005A0 __libc_csu_init proc near               ; DATA XREF: _start+16↑o
.text:00000000004005A0
.text:00000000004005A0 var_30          = qword ptr -30h
.text:00000000004005A0 var_28          = qword ptr -28h
.text:00000000004005A0 var_20          = qword ptr -20h
.text:00000000004005A0 var_18          = qword ptr -18h
.text:00000000004005A0 var_10          = qword ptr -10h
.text:00000000004005A0 var_8           = qword ptr -8
.text:00000000004005A0
.text:00000000004005A0 ; __unwind {
.text:00000000004005A0                 mov     [rsp+var_28], rbp
.text:00000000004005A5                 mov     [rsp+var_20], r12
.text:00000000004005AA                 lea     rbp, cs:600E24h
.text:00000000004005B1                 lea     r12, cs:600E24h
.text:00000000004005B8                 mov     [rsp+var_18], r13
.text:00000000004005BD                 mov     [rsp+var_10], r14
.text:00000000004005C2                 mov     [rsp+var_8], r15
.text:00000000004005C7                 mov     [rsp+var_30], rbx
.text:00000000004005CC                 sub     rsp, 38h
.text:00000000004005D0                 sub     rbp, r12
.text:00000000004005D3                 mov     r13d, edi
.text:00000000004005D6                 mov     r14, rsi
.text:00000000004005D9                 sar     rbp, 3
.text:00000000004005DD                 mov     r15, rdx
.text:00000000004005E0                 call    _init_proc
.text:00000000004005E5                 test    rbp, rbp
.text:00000000004005E8                 jz      short loc_400606
.text:00000000004005EA                 xor     ebx, ebx
.text:00000000004005EC                 nop     dword ptr [rax+00h]
.text:00000000004005F0
.text:00000000004005F0 loc_4005F0:                             ; CODE XREF: __libc_csu_init+64↓j
.text:00000000004005F0                 mov     rdx, r15
.text:00000000004005F3                 mov     rsi, r14
.text:00000000004005F6                 mov     edi, r13d
.text:00000000004005F9                 call    qword ptr [r12+rbx*8]
.text:00000000004005FD                 add     rbx, 1
.text:0000000000400601                 cmp     rbx, rbp
.text:0000000000400604                 jnz     short loc_4005F0
.text:0000000000400606
.text:0000000000400606 loc_400606:                             ; CODE XREF: __libc_csu_init+48↑j
.text:0000000000400606                 mov     rbx, [rsp+38h+var_30]
.text:000000000040060B                 mov     rbp, [rsp+38h+var_28]
.text:0000000000400610                 mov     r12, [rsp+38h+var_20]
.text:0000000000400615                 mov     r13, [rsp+38h+var_18]
.text:000000000040061A                 mov     r14, [rsp+38h+var_10]
.text:000000000040061F                 mov     r15, [rsp+38h+var_8]
.text:0000000000400624                 add     rsp, 38h
.text:0000000000400628                 retn
.text:0000000000400628 ; } // starts at 4005A0
```
可以看到，在loc_400606处，对大量寄存器进行了mov操作（依情况而定，也些csu代码有通过pop来改变内存的），而mov的源操作数则来自栈（使用了栈指针rsp），这意味着可以通过栈溢出控制栈，从而控制这些寄存器的值。

但是r12、r15这类寄存器并不是我们常用的控制函数执行的寄存器，控制了他们并不能直接起作用，在x86_64中，我们是通过控制rdi、rsi、rdx、rcx、r8、r9这六个寄存器来调用特定函数的，因此我们还需要libc_csu_init的loc4005f0的代码，这些代码会把我们控制的r14、r15等寄存器的值，传给我们真正想要利用的rdi、rsi等。

csu的利用不是找直接的pop ret gadget，也不一定要对寄存器的完全控制，比如对于上述的csu代码，我们就只能控制edi，也就是rdi的低32位，不同版本的libc_csu_init的汇编也不同，需要灵活利用。



# exp编写

具体exp思路很简单，一共分三段，第一段payload负责找到libc基址，第二段负责写入/bin/sh，第三段getshell。

![ref5](/assets/images/2025-10-31-ret2csu-study-note/ref5.png)

这里我们自定义一个csu的利用函数，从csu的代码来看，我们的csu的payload构造应该满足如下要求，rbx应该是0，rbp应该是1，这样cmp比较的结果就相等了，cmp实际是通过减法比较的，比较后对应的标志寄存器会设为0，则不满足jnz的跳转情况，也就不会跳转到0x4005f0；r12的值应该是我们想要调用的函数的地址，r13d的值应该是我们想要控制的rdi的值，r14值应该控制rsi，r15控制rdx。

![ref6](/assets/images/2025-10-31-ret2csu-study-note/ref6.png)

关于csu函数的构造，我们希望调用时，先返回到csu_init的后半段，这一段都是pop之类的改各个寄存器值的，见下图的0x400606到0x40061f区域，然后再返回到前半段0x4005f0，这一段能把我们刚刚改的各寄存器的值用上，并且还能call一个函数，同时我们不能让jnz的跳转执行，否则会破坏原先已经设置好的寄存器值，打乱控制流。到这里，我们就可以像ret2libc_x64那样构造各种寄存器值，然后给call的函数传参、调用了。为了反复调用多个函数，最后还需要把返回地址设为main。

![ref7](/assets/images/2025-10-31-ret2csu-study-note/ref7.png)

我们最开始可以使用调用过的write泄露出某函数地址再算基地址，然后第二次调用的时候，通过read读入binsh字符串，这里注意一下，之所以要读入，不能直接从libc里找，是因为控制参数的rdi，注意上图0x4005f6，我们只能通过r13d给edi也就是rdi的低32位传参，bss段的高32位刚好是0所以传过去没问题，但libc里的binsh高32位地址并不是0，如果通关r13d传过去高位的数就会被舍弃，导致execve找不到参数位置。这里把execve也写入bss段是出于另外一个原因，此处不能像ret一样，写哪个地址就直接跳到哪个地址，如果直接用execve的地址传入给r12，那其实call [r12]会再做一次解析。比如原本execve的地址是0x123，那么ret 0x123就会跳转到0x123，但call [0x123]，则会先从0x123这个位置取数据，比如是0x456，然后再跳转到0x456，这样执行的就不是我们想要的execve了（不用system是因为有问题，system的执行过程相较于execve复杂，如果实战中system无法成功利用就考虑execve）。

第三段去bss段找我们写入的东西就行，注意这里和ret2shellcode的区别，我们并不是在bss段上执行的，因为call [r12]会解析地址，当r12是bss段的地址时，解析它实际会得到真正的execve的地址（在内存某处的libc），然后跳转到这个地址去执行。

最后getshell。

![ref8](/assets/images/2025-10-31-ret2csu-study-note/ref8.png)

