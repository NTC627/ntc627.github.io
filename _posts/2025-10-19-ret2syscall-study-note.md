---
layout: post
title: "[PWN]ret2syscall学习笔记"
date: 2025-10-19
categories: [PWN]
---


# 1.信息检查

这一题开启了NX保护

![ref1](/assets/images/2025-10-19-ret2syscall-study-note/ref1.png)

IDA反汇编可以看到，这回不自带shell函数，也提示无法注入shellcode，但是gets无任何限制，所以依然是依靠栈溢出。

![ref2](/assets/images/2025-10-19-ret2syscall-study-note/ref2.png)

所以这题要用的打法是ret2syscall，利用的是syscall系统调用的执行原理--当寄存器的值满足一定值，并且触发int 0x80中断时，程序就会转去执行系统调用，执行的系统调用代码不在程序本身里，所以可以绕过NX保护。



# 2.Gadgets拼接

先尝试跟着ctf wiki的思路来，使用execve("/bin/sh",NULL,NULL)这一系统调用，直接获取shell，为了执行这个系统调用，寄存器的值应为下列值

```
eax=0xb
ebx=/bin/sh的ADDR
ecx=0
edx=0
```

所谓的Gadgets，就是指程序执行时，内部的原有的代码片段，利用Gadgets就是把这些本来不是恶意的代码片段找出来，拼接成恶意的代码，为了找到符合要求的Gadgets，需要使用工具ROPgadget。由于一开始要使eax是0xb，所以先找pop eax的地址，这样只要再把0xb填写在栈中的后一个位置，当函数返回时先返回到执行pop eax的代码地址，此时栈顶的元素就是0xb，pop取出后eax的值也就变为了0xb。

![ref3](/assets/images/2025-10-19-ret2syscall-study-note/ref3.png)

注意要构造一个完整的链，因此pop eax结束后不能就完了，还需要ret，ret指令在汇编中的作用就是把栈顶数据当成ip（下一条指令的地址），pop的同时修改eip的值。我们希望程序修改eax的值后继续修改其它寄存器的值，因此我们需要ret来继续执行pop ebx、ecx的代码。这里就跟教学一样选择0x080bb196作为我们的代码就行。

接下来继续找其它代码片段。

![ref4](/assets/images/2025-10-19-ret2syscall-study-note/ref4.png)

![ref5](/assets/images/2025-10-19-ret2syscall-study-note/ref5.png)

![ref6](/assets/images/2025-10-19-ret2syscall-study-note/ref6.png)

再算算需要覆盖多少，依旧是112

![ref7](/assets/images/2025-10-19-ret2syscall-study-note/ref7.png)

如果知道使用IDA的话，系统调用所需要的字符其实还可以在IDA中shift+f12寻找，对于分析题目的话也会更方便

![ref10](/assets/images/2025-10-19-ret2syscall-study-note/ref10.png)



# 3.exp编写

exp编写如下，这里用到了一个新（对本人来说）函数flat，来把多个变量转换成一串二进制值。

![ref8](/assets/images/2025-10-19-ret2syscall-study-note/ref8.png)

执行后getshell。

![ref9](/assets/images/2025-10-19-ret2syscall-study-note/ref9.png)
