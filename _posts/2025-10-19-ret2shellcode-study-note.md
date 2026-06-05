---
layout: post
title: "ret2shellcode学习笔记"
date: 2025-10-19
---

### ret2shellcode

#### 1.信息检查

题目中提供的程序本应该是无NX保护的，但由于我linux的内核版本较高，因此自带保护

![ref1](/assets/images/2025-10-19-ret2shellcode-study-note/ref1.png)

可以看到，我这里的bss段是不可执行的。

![ref2](/assets/images/2025-10-19-ret2shellcode-study-note/ref2.png)

我的方案是把程序放在较低版本的ubuntu 14，然后开个端口运行该程序，再用kali远程连接这个端口去打。



#### 2.地址计算

ret2shellcode，首先要想办法把shellcode写到可执行的bss段中，然后覆盖返回地址跳转到shellcode执行，为了计算填充到返回地址所要的字符数，需要计算变量缓冲区初始地址到ebp+4的距离（ebp是栈底，ebp+4就是返回地址的位置），计算返回地址需要通过动态调试，ida反编译中提供的变量偏移并不准确。

为了准确的计算，可以先在main函数中打断点，然后单步运行到gets处

![ref3](/assets/images/2025-10-19-ret2shellcode-study-note/ref3.png)

此时可以有两种方法可以计算变量的偏移，第一种

![ref4](/assets/images/2025-10-19-ret2shellcode-study-note/ref4.png)

由函数调用前的esp的状态可以知道变量对于esp的偏移是0x1c，此时再去看esp和ebp分别为0xffffcf90和0xffffd018，所以变量对于ebp的偏移就是ebp-esp-0x1c=0xffffd018-0xffffcf90-0x1c=6c=108，ebp对返回地址的偏移是4，所以变量对返回地址的偏移是108+4=112。

![ref5](/assets/images/2025-10-19-ret2shellcode-study-note/ref5.png)

第二种方法，可以直接塞个变量观察一下，使用cyclic生成一个100的变量（缓冲区的大小），然后输入进去再看看栈怎么样，从下图可以看到变量覆盖到了-00c的区域，离ebp还有8的数据，离返回地址还有12的数据，所以变量应该要112才足够覆盖返回地址。

![ref6](/assets/images/2025-10-19-ret2shellcode-study-note/ref6.png)



#### 3.exp编写

exp编写如下，先把shellcode代码生成出来，然后向缓冲区发送该填充的shellcode和返回地址（填充通过ljust自动把不够112的部分补A），随后由于程序执行会把我们strncpy到buf区，所以shellcode也被复制了过去，而返回地址则被buf的地址覆盖，当程序执行到返回时，便会返回到bss段中的shellcode然后执行。

![ref7](/assets/images/2025-10-19-ret2shellcode-study-note/ref7.png)

执行后getshell。

![ref8](/assets/images/2025-10-19-ret2shellcode-study-note/ref8.png)

