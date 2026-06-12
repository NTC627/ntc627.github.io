---
layout: post
title: "[PWN]ret2csu学习笔记"
date: 2025-10-31
categories: [PWN]
---

### 信息检查

checksec。

![ref1](/assets/images/2025-10-31-ret2csu-study-note/ref1.png)

反汇编。这回又更加不同了，main函数里没有get，直到返回处才调用了一个vulnerable_function，函数里的返回处又调用了read，从标准输入中读512个无符号长长整数到容量为128的buf中，所以肯定是栈溢出，那么考虑溢出的ROP链的构造。

![ref3](/assets/images/2025-10-31-ret2csu-study-note/ref2.png)

![ref3](/assets/images/2025-10-31-ret2csu-study-note/ref3.png)

首先由于NX保护，ret2shellcode肯定不行了，然后是ret2syscall和ret2libc，但是可以ROPgadget看到根本没有可以利用的gadget来pop rdi，那就也不行了。

![ref4](/assets/images/2025-10-31-ret2csu-study-note/ref4.png)

此时就涉及到更复杂的利用ret2csu。



### Ret2csu

简单来说就是去找gadget的gadget。具体来说就是有个初始化libc的函数libc_csu_init，从它里面去找任何能改变寄存器且可控的gadget，不要求是直接从栈上pop然后ret了，也不要求直接能改rdi等，利用mov等语句间接更改rdi的也行，甚至不要求改完整个寄存器，利用edi等直接改rdi低位也可以，总之就是非常灵活。要注意不同版本的libc_csu_init的汇编也不同。



### exp编写

具体exp思路很简单，一共分三段，第一段payload负责找到libc基址，第二段负责写入/bin/sh，第三段getshell。

![ref5](/assets/images/2025-10-31-ret2csu-study-note/ref5.png)

![ref6](/assets/images/2025-10-31-ret2csu-study-note/ref6.png)

关于csu函数的构造，我们希望调用时，先返回到csu_init的后半段，这一段都是pop之类的改各个寄存器值的，见下图的606到61f区域，然后再返回到前半段5f0，这一段能把我们刚刚改的各寄存器的值用上，并且还能call一个函数，到这里，我们就可以像ret2libc_x64那样构造各种寄存器值，然后给call的函数传参、调用了。为了反复调用多个函数，最后还需要把返回地址设为main。

![ref7](/assets/images/2025-10-31-ret2csu-study-note/ref7.png)

我们最开始可以使用调用过的write泄露出某函数地址再算基地址，然后第二次调用的时候，通过read读入binsh字符串，这里注意一下，之所以要读入，不能直接从libc里找，是因为控制参数的rdi，注意上图5f6，我们只能通过r13d给edi也就是rdi的低32位传参，bss段的高32位刚好是0所以传过去没问题，但libc里的binsh高32位地址并不是0，如果通关r13d传过去高位的数就会被舍弃，导致execve找不到参数位置。这里把execve也写入bss段是出于另外一个原因，此处不能像ret一样，写哪个地址就直接跳到哪个地址，如果直接用execve的地址传入给r12，那其实call [r12]会再做一次解析。比如原本execve的地址是0x123，那么ret 0x123就会跳转到0x123，但call [0x123]，则会先从0x123这个位置取数据，比如是0x456，然后再跳转到0x456，这样执行的就不是我们想要的execve了（不用system是因为有问题，原因未知）。

第三段去bss段找我们写入的东西就行，注意这里和ret2shellcode的区别，我们并不是在bss段上执行的，因为call [r12]会解析地址，当r12是bss段的地址时，解析它实际会得到真正的execve的地址（在内存某处的libc），然后跳转到这个地址去执行。

最后getshell。

![ref8](/assets/images/2025-10-31-ret2csu-study-note/ref8.png)

