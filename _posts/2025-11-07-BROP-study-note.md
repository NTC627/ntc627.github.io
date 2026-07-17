---
layout: post
title: "[PWN]BROP学习笔记"
date: 2025-11-07
categories: [PWN]
---
不是所有情况都能获取到程序二进制文件，一些内部程序在网上永远也不会公开，这时候就只能依靠盲打的技术去进行ROP攻击。BROP即Blind ROP，是一种无需二进制文件的远程攻击技术，该技术公开于2014年的一篇论文*Hacking Blind*，文中详细描述了攻击的技术，可阅读以获取详细内容，本文内容基于论文，但不如原文详细。

# BROP原理

BROP是针对没有二进制文件或源码的程序的攻击手段。主要依赖以下技术完成对保护的绕过、对gadget的搜索。



## 暴力枚举

通过输入不同长度的测试数据，来看看多少长度的数据能使程序崩溃，以判断padding



## Stack Reading

即通过逐个字节覆盖的方法，读取栈上的内容，如果覆盖的内容为栈上原本的内容，程序就不会崩溃，否则说明覆盖内容与栈上内容不同。对于每个字节，最多只需要覆盖256次即可找到正确的字节。



## BROP Gadget

BROP Gadget即libc_csu_init结尾部分的一堆pop，注意其中最后的pop r14; pop r15; ret三行，这里如果从0x7的偏移（相对于第一个pop的偏移）去读的话，就可以解读出pop rsi; pop r15; ret，如果从0x9去读，就可以读出pop rdi; ret。也就是可以利用一个pop多控制两个寄存器，还是rdi、rsi这两个传参寄存器。

![ref3](/assets/images/2025-11-07-BROP-study-note/ref3.png)



## Stop、Trap、Probe Gadget

三种Gadet的作用，分别是给攻击者正反馈、给攻击者负反馈、要探测的Gadget的地址。给攻击者正反馈即执行到Stop Gadget时程序不会崩溃，可能进入循环，可能向攻击者发送其它信息，总之不是崩溃，负反馈则是执行到就会崩溃。通过三种Gadget在栈上不同的布设顺序，我们就可以找到我们想找的Gadget。

![ref1](/assets/images/2025-11-07-BROP-study-note/ref1.png)

参见上图（来自论文Blind Hacking），左图是通过stop gadget判断有没有找到gadget（任意），右图则是通过trap和stop的组合来判断找到的gadget是`pop|ret`还是普通的ret。

![ref2](/assets/images/2025-11-07-BROP-study-note/ref2.png)

此外还有其它组合，比如上图，`probe + stop + traps`就能找出ret的gadget，`probe + trap + stop + traps`就能找到pop|ret型，`probe + stop + stop + stop + stop  + stop + stop + stop + traps`就能找到六连pop。



## Gadget识别

找到pop ret还不够，因为不知道是pop了哪些寄存器。这里就依靠系统调用来识别，首先系统调用靠的是rax来传递系统调用号，所以必须要先找出哪个是rax，这里使用无参的系统调用pause()来确定，给找到的所有`pop|ret` gadget都试试看传这个系统调用号，执行成功了的话，系统会暂停（不是崩溃），那么也就找到了rax。其它寄存器也是用系统调用逐个去找，下面列出一张表来展示找的顺序与寄存器与系统调用的关系。


| Order | Reg  | Syscall                                  |
| ----- | ---- | ---------------------------------------- |
| 1     | rax  | pause()                                  |
| 2     | rdi  | nanosleep(len, rem)                      |
| 3     | rsi  | kill(pid, sig)                           |
| 4     | rdx  | clock_nano_sleep(clock, flags, len, rem) |


其中2的和4的rem参数其实可以不用管，所以可以看到每一个系统调用的参数都是逐个递增加1的。注意kill的话需要杀掉进程，我们可以多开几个连接到服务端的程序，然后杀掉我们自己的进程来验证有没有触发系统调用。



# BROP攻击流程

有了上述的技术就可以开始攻击了，攻击流程如下

1.构造暴力枚举数据，枚举出溢出长度

2.通过栈读取读取栈的信息，有canary就读canary，没有可以读读后面的返回地址之类的。

3.通过全代码从头扫描的模式，找到Stop Gadget（Trap Gadget很好找，或者随便编一个不存在的地址就行）

4.利用Stop、Trap，去找真正可以用来攻击的gadget（`pop|ret`）。

5.由于rdx一般不好找，如果找不到的话，我们可以先找PLT表，然后调用strcmp，这个函数会藏有rdx的gadget，PLT表的找法也是利用stop、trap、probe组合，顺便也可以找找write或puts的PLT用于泄露，找不到也没关系可以系统调用。

6.找好gadget后，用识别技术来识别。

7.构造payload调用write或puts，把整个.text段的二进制dump出来，以便构造后续的攻击，前面信息够了直接开打也行。

8.根据dump构造后续payload。



# 来个真题！

题目来自BUUCTF的axb_2019_brop64。

## 测padding

开局先别急，先连接服务上去看看到底怎么个事儿。

![ref5](/assets/images/2025-11-07-BROP-study-note/ref5.png)

从反应来看，它一进去就接收了一个输入，然后又输出。那么我们可以开始试试看它接收输入的时候有没有溢出了。

![ref6](/assets/images/2025-11-07-BROP-study-note/ref6.png)

来个512长的直接触发core dump了，看来是有的，接下来找找padding在哪里，可以根据它结尾的Goodbye判断溢出了没有

![ref7](/assets/images/2025-11-07-BROP-study-note/ref7.png)

测出来的结果是这样

![ref8](/assets/images/2025-11-07-BROP-study-note/ref8.png)

所以应该是217字节（sendlineafter自动加了个'\n'）的时候把返回地址覆盖了，那我们的padding构造216就够了。另外从报错来看没有触发任何栈溢出检测，所以不用stack reading。



## 找Stop Gadget

这个东西不要从0x400000开始遍历，会非常慢，哪怕只用测不到十万个，每次连接和断开都要耗掉两三秒。找的思想大概就是从最初的起始地址开始遍历，看看什么时候遍历到main，如果遍历到，应该会出现之前对话中的字符串，这时候就可以停下了。

![ref9](/assets/images/2025-11-07-BROP-study-note/ref9.png)

最后找到了main函数位置做为stop gadget，可以看到在发送完payload后，程序重新发送了最开始的内容。

![ref10](/assets/images/2025-11-07-BROP-study-note/ref10.png)

## 找BROP Gadget

虽然本机跑会少掉连接的延迟，会很快，但是同时也会产生大量运行错误的dump，一定要注意，否则可能会直接跑崩。。。。。本人机器已经恢复快照过一次了，稳妥起见我还是远程打容器的吧，可以看到这里端口都和前面不一样了，就是因为容器dump多了也会直接崩的无法重启。

![ref11](/assets/images/2025-11-07-BROP-study-note/ref11.png)

跑出来0x40095a，就是要找的libc_csu_init的六连pop的地址。这里可以不用判断什么是什么gadget，可以直接根据libc_csu_init中每个pop的偏移，直接使用对应的寄存器。

![ref12](/assets/images/2025-11-07-BROP-study-note/ref12.png)



## 找puts@plt

plt表中的元素都是16字节对齐的，所以找的时候可以把步长设为16。同时rdi给puts传参，如果是puts的话，它应该会把0x400000里的东西打出来，接收到的响应会有ELF字样并且程序仍能正常返回到main函数。

![ref13](/assets/images/2025-11-07-BROP-study-note/ref13.png)

找到了，在0x400640。

![ref14](/assets/images/2025-11-07-BROP-study-note/ref14.png)



## 泄露内存

把数据dump出来，说着简单，处理的时候还是有点点小麻烦的，写脚本的时候要结合debug，看看到底哪里是dump出来的有用的字节，还要注意处理不可见字符。因为已经知道了puts的plt在0x400640，所以dump一下附近范围的数据就行，全dump完会很浪费时间，因为puts一定会被我们的ROP调用，所以读到0x400640时，这里的内容会是puts的got表位置。

![ref15](/assets/images/2025-11-07-BROP-study-note/ref15.png)

读出来是这样

![ref16](/assets/images/2025-11-07-BROP-study-note/ref16.png)

拖进IDA，rebase设为我们开始读的地址0x400630，然后去看看0x400640，这里的jmp就是got表，之后再用puts把got表里的内容泄露出来，就得到了puts在内存中的地址，然后就可以找一下libc，ret2libc了。

![ref17](/assets/images/2025-11-07-BROP-study-note/ref17.png)



## Getshell&Getflag

![ref18](/assets/images/2025-11-07-BROP-study-note/ref18.png)

Pwn！！！

![ref19](/assets/images/2025-11-07-BROP-study-note/ref19.png)

