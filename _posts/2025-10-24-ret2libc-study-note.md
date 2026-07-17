---
layout: post
title: "[PWN]ret2libc学习笔记"
date: 2025-10-24
categories: [PWN]
---
​ret2libc，即返回到libc库，libc是c语言的动态链接库，包含了许多函数，比如常见的printf、scanf、puts，也包含了我们通常ROP要利用的system和execve，ret2libc就是通过返回到这个库的方式来调用这些函数。多说无用，直接以三道题目来看看ret2libc吧。





# ret2libc1

## 信息检查

先进行程序信息的检查，开启了NX保护

![ref1.1](/assets/images/2025-10-24-ret2libc-study-note/ref1.1.png)

然后看IDA反汇编，可以看到gets函数没有限制，所以存在栈溢出。

![ref1.2](/assets/images/2025-10-24-ret2libc-study-note/ref1.2.png)





## Ret2libc

还是先看看返回地址怎么样，毕竟无论怎么溢出，至少都要先把返回地址覆盖了，可以看到依旧是需要覆盖112的数据。

![ref1.3](/assets/images/2025-10-24-ret2libc-study-note/ref1.3.png)

这题应该不能使用ROPgadget了，但还是先试试找找gadget，可以确认确实找不到

![ref1.4](/assets/images/2025-10-24-ret2libc-study-note/ref1.4.png)

里面也没有编译好的system("/bin/sh")，但是可以看到在bss段和plt表中分别有/bin/sh字符串和system的链接。

![ref1.5](/assets/images/2025-10-24-ret2libc-study-note/ref1.5.png)

![ref1.6](/assets/images/2025-10-24-ret2libc-study-note/ref1.6.png)

![ref1.7](/assets/images/2025-10-24-ret2libc-study-note/ref1.7.png)

所以可以利用这两组合成完整的system("/bin/sh")来攻击。



## exp编写

具体做法就是把返回地址写成system的plt地址，然后把/bin/sh作为参数传递给system

![ref1.8](/assets/images/2025-10-24-ret2libc-study-note/ref1.8.png)

需要注意，我们在溢出时是完全破坏了原来的栈帧的，而且为了程序能正常运行，我们需要构造一个新的栈帧，去模拟call指令调用system的行为。在把plt_system_addr覆盖到原返回地址后，我们还需要构造其参数和返回地址，正常来说参数和返回地址都应该由汇编指令正确的写到栈上，所以我们需要像正常调用system一样，帮忙补全栈帧。

```
高地址				----------->
					溢出后
0x03	[各种局部变量]			[system函数的参数](对应0x02，覆盖了原变量)
0x02	[原参数]				  [system函数返回地址](对应0x01，覆盖原参数)
0x01	[原返回地址]				 [plt_system的地址](覆盖原返回地址)
低地址
```

简单点说，就要从低地址到高地址，要满足返回地址-->函数参数的调用格式

发送payload后getshell。

![ref1.9](/assets/images/2025-10-24-ret2libc-study-note/ref1.9.png)



# ret2libc2

## 信息检查

先进行程序信息的检查，保护内容和ret2libc1的内容一致所以略。然后IDA反编译。

![ref2.1](/assets/images/2025-10-24-ret2libc-study-note/ref2.1.png)

这回是/bin/sh字符串没有了，此外也没有ret2syscall需要的int 0x80。只留下了plt表中的system

![ref2.2](/assets/images/2025-10-24-ret2libc-study-note/ref2.2.png)

![ref2.3](/assets/images/2025-10-24-ret2libc-study-note/ref2.3.png)



## Ret2libc

所以解题的思路是我们自己输入/bin/sh字符串，然后拼接一下，我们需要从gets中读取，但由于原本的gets读到的字符放在栈缓冲区，而不在bss段里，我们没法用原来的gets读取并存储/bin/sh，所以我们需要利用ROP构造自己的gets，然后读到bss段中，可以通过pwndbg的vmmap确认，bss段确实是可以写的。

![ref2.4](/assets/images/2025-10-24-ret2libc-study-note/ref2.4.png)

利用链是这样：第一次返回，返回到gets，第二次返回，返回到system。需要构造的栈帧结构应该如下

```
高地址              ------->
					溢出后
	                          [buf地址]
	                          [system的返回地址]（随便填）
	                          [plt_system_addr]
	[其它]                     [buf地址]     
	[原参数]                   [pop_exx_ret的地址]
	[原函数返回地址]             [plt_gets_addr]
低地址
```

这里注意，gets的返回地址不能乱填，因为还需要构造到system的链，也不能仅仅是ret的gadget，因为ret后会把栈顶当成指令pop到eip，而如果不pop的话，栈顶会还是buf的地址，所以我们需要pop，至于pop谁无所谓（经测试连pop ebp都可以，但如果构造长的利用链最好还是别这么玩），后面的部分就和ret2libc1一样了。

![ref2.5](/assets/images/2025-10-24-ret2libc-study-note/ref2.5.png)



## exp编写

exp编写如下，所有用到的地址都很好找，但是注意写入到bss段的时候有个小坑，那就是bss段不是任意地方都可以随便写的，要写到程序里分配好的未初始化变量buf2里，这样才能被system当成参数执行

![ref2.6](/assets/images/2025-10-24-ret2libc-study-note/ref2.6.png)

最后getshell

![ref2.7](/assets/images/2025-10-24-ret2libc-study-note/ref2.7.png)



# ret2libc3

## 信息检查

IDA反编译。这次连system也不自带了。但依然是栈溢出。这次要利用的是ret2libc。

![ref3.1](/assets/images/2025-10-24-ret2libc-study-note/ref3.1.png)



## Ret2libc

在开始前先介绍一下ret2libc的实现。简单来说就是依靠两个机制，首先程序运行时，除了把程序加载进内存，还会把程序需要的库文件加载到内存。然后还存在一个延迟绑定的机制，就是比如printf这样的库里的函数，编译时不会把库里的函数代码一起编译，而是会创建一个PLT和GOT表，PLT指向函数在GOT表的位置，GOT表指向函数真实内存位置，但GOT表并不是一开始就指向真实内存位置，而是函数被调用时才动态链接，把真实地址加载进GOT表。

由于整个库都在内存中，所以我们可以直接去找程序里没有调用的库函数，而为了找到这个库在内存哪，我们还需要从GOT表里获取某个函数在内存的哪，然后才计算出库的地址。

libc就是一个c语言库，提供了大量的标准函数，包括system包括/bin/sh，我们ret2libc的目标就是在内存里找到这俩。而要找到这俩，就要先找到libc在内存中的基地址，要找基地址，就得依靠刚刚说的GOT表的函数的地址，要找GOT表中的函数的地址，就需要函数先在程序中执行过，还需要用一些函数去把它在GOT表中的地址泄露出来（比如puts）。还有一个非常重要的机制是，main函数其实并不是程序运行时第一个调用的函数，libc_start_main才是，这个函数会负责各种初始化，然后才到main。

具体来说，我们要泄露libc_start_main的地址，因为这个函数肯定会最先执行，最稳定，泄露方式则是通过puts函数，这个函数是最简单的，参数简单，执行简单，如果有就用它就行了，找到libc_start_main的地址后，我们需要根据这个地址一个个去比对不同libc中的libc_start_main的地址（地址最后12位是固定的），去确定我们的libc_start_main是哪个版本的libc，当然，也可以使用libcsearcher直接帮我们自动找，找到libc的版本后，就需要再去找libc_start_main的地址（不是内存中的那个啊，是libc里面的那个）在该libc中的偏移（有ASLR的话，libc基地址是会随机的，但表里的各项函数的地址不随机，所以相对偏移还是固定的），从而根据内存中的libc_start_main的地址和偏移计算出libc的基地址。有了版本和基地址后，就可以根据偏移（使用各种工具查）去找任意其它表中的函数或者啥的了。



## exp编写

ctf-wiki的exp编写如下，基本就是上面讲的过程的代码化，注意一下第二次调用main的payload的填充要重新算，和一开始不一样了。

![ref3.2](/assets/images/2025-10-24-ret2libc-study-note/ref3.2.png)

然而ctf-wiki的脚本我只在ubuntu 14的版本中测试成功了，其它linux操作系统都有各种问题。

由于其它系统的libcsearcher可能存在问题（或者是我自己操作问题），我在ubuntu 24中又自己编写了一个可以成功getshell的脚本，脚本里没有用libcsearcher，而是我自己手工ldd找程序用的libc.so.6，再去网上https://libc.blukat.me/或者直接在这个文件里面找偏移自己算，最后也能成功。

![ref3.3](/assets/images/2025-10-24-ret2libc-study-note/ref3.3.png)

getshell

![ref3.4](/assets/images/2025-10-24-ret2libc-study-note/ref3.4.png)

此外，在kali中执行同样的payload会发现连地址都泄露不出来，经查发现是libc的问题。

![ref3.5](/assets/images/2025-10-24-ret2libc-study-note/ref3.5.png)

把libc从2.41换成2.39就好了。

![ref3.6](/assets/images/2025-10-24-ret2libc-study-note/ref3.6.png)


