---
layout: post
title: "[PWN]栈迁移相关学习笔记"
date: 2025-11-14
---

### 栈迁移

用两个例子来学习栈迁移。



#### 案例一

第一个例子随便看看就得了，不是很实用，可以看到它直接给了可读可写可执行的段，NX保护又没开，栈还可执行，就是让我们直接在栈上写东西的。

![ref1](/assets/images/2025-11-14-zqy-study-note/ref1.png)

再看反汇编代码，main函数里返回了一个vul，所以直接看看vul里是什么东西，可以看到字符数组长度32个字节，而我们能往里面输入50字节，也就是溢出18字节，32位程序栈上每个单元就是4字节，也就是说根本部署不了几段Payload就填满18字节了，那么就不够用，需要使用栈迁移。

![ref2](/assets/images/2025-11-14-zqy-study-note/ref2.png)

这一题的迁移就直接迁移到栈上就可以了，具体的迁移的话，其实就是依靠改变ebp和esp实现的，因为这题栈可以执行，所以就没有ebp的事情，直接把esp变成我们在栈上写shellcode的地方然后jmp过去就行了。

![ref3](/assets/images/2025-11-14-zqy-study-note/ref3.png)

虽然参考价值不大，但我们还是可以从中瞥见栈迁移的思想的，注意栈迁移到栈的payload和以往有一个非常大的不同之处就是，payload的ROP部分是布置在padding前而非以往的返回地址处的，也就是说实际上ROP的部分在最开始并不构成栈溢出，直到payload的后半部分改变了esp，指向了ROP的部分，才会开始执行我们的代码。知道这一点以后就来看看真正实用的例子吧。



#### 案例二

第二题回归正常（简单）的防护水平，NX开了，不过没有PIE，没有PIE算是栈迁移一个比较重要的点，如果地址是变动的话，迁移的地方就不好找了。

![ref4](/assets/images/2025-11-14-zqy-study-note/ref4.png)

打开ida看看，main中一直在循环一个有栈溢出的函数，buf大小80，可以输入96，只能溢出16字节，这是64位，也就是只能覆盖到ebp和返回地址，根本不够去构造ROP链。那必须狠狠迁移了。

![ref5](/assets/images/2025-11-14-zqy-study-note/ref5.png)



迁移的第一步是先找到迁移的位置，可以利用puts泄露栈地址，当buf刚好填充80个a时，此时由于字符串数组没有00分隔，puts就会把栈后的rbp也视为字符串的一部分打印出来，于是就得到了rbp的值

![ref6](/assets/images/2025-11-14-zqy-study-note/ref6.png)

rsp执行栈顶，rbp指向栈底，两者相减就可以得到栈的空间是0x70，我们要让把rbp迁移到rsp的位置，所以就是要让rbp指向rsp，用当前rbp-0x70就能得到我们要迁移的位置stack，也就是把rbp迁移到栈顶

![ref7](/assets/images/2025-11-14-zqy-study-note/ref7.png)

迁移完成后，我们就有了更多的空间执行指令，这时候就可以开始考虑泄露Libc基地址，来调用里面的系统类函数什么的。具体payload如下

![ref8](/assets/images/2025-11-14-zqy-study-note/ref8.png)

接下来说说这条payload是怎么构造的，原理是什么。

##### 原理部分

首先，每个函数执行完后，都会执行leave和ret指令，ret指令就是pop然后返回到对应地址，重点是leave，leave这个指令相当于mov rsp, rbp; pop rbp;也就是先通过mov rsp, rbp把rsp的值设为rbp，达到清空栈的目的，然后pop rbp把原来的栈底变成栈顶，也就是恢复成上一个调用函数的栈帧。由于这个操作会同时控制rsp和rbp两个关于栈的重要指针，因此栈迁移的核心实现就靠它们。

其次，细看payload，前面的deadbeef、pop_rdi。。。一直到填充，这里这一段很明显就是我们上面说的，ROP布置在填充前而非返回地址后，这行payload最开始，只有stack和leave_ret是溢出的部分，那么我们来细看这两部分做了什么。

由于函数本身执行完自带leave ret，我们又给它多填了一个leave ret，那么实际上函数就一共执行了两次leave ret，对于该payload，执行流程是这样：

1.函数自己第一次leave和ret，leave使rsp=rbp，rbp=stack，ret后又返回到了我们布置的leave_ret去执行

2.函数第二次leave和ret执行的就是我们给它部署的了，此时leave的mov rsp, rbp会使rsp=stack，那么pop rbp会怎么样？栈好像已经被我们搞乱了？但其实也没这么难理解，当mov rsp, rbp使rsp=stack，栈顶指针就已经变成了我们想给它执行的方向了，也就是我们要迁移的地址stack。而stack这个地址指向的位置是原来的栈顶，也就是我们输入的deadbeef那里，即rsp=>deadbeef，见下图，当pop rbp的时候，会把栈顶rsp指向的元素deadbeef弹出栈并赋值给rbp，那么rbp就会变成deadbeef。此时栈迁移就已经完成了。

![ref9](/assets/images/2025-11-14-zqy-study-note/ref9.png)

以防上面的文字太难理解，下面简化一点来说。

```shell
#leave => mov rsp, rbp; pop rbp;
#ret => pop rip; 

#第一次 leave & ret: rsp=rbp, rbp=stack, 然后 ret 返回到 leave_ret
#第二次 leave & ret: rsp=stack, rbp=deadbeef 然后 ret 返回到 pop_rdi

#栈迁移到栈的低位地址, 使可以溢出的空间变多
#			低 <----------  高
#迁移前: 	[rsp################rbp###] 
#迁移后:   [rbp(rsp)#################]
#可以看到栈本身的空间是没变的, 但是我们把rbp移到低位了, 等于是本来需要填充才能触发溢出，现在一输入就能触发溢出，这样就能有更多空间部署rop

sh.sendafter(b">", flat([b'deadbeef', pop_rdi, elf.got['puts'], elf.plt['puts'], func_vul, (80 - 40) * b'1', stack, leave_ret]))
```

3.迁移过程完成后，deadbeef就成为了rbp，pop_rdi就成为了第一个返回地址，ret后就会给rsp减一执向pop_rdi然后去执行，后面的部分按我们正常部署ROP链来的就行。记一个结论就行，把rbp覆盖成要迁移的地址，把原返回地址覆盖成leave_ret指令，就能把rbp和rsp都变成要迁移的地址。



##### 实操部分

实际操作的话，对我们来说最重要的是找到迁移的位置。如何确定迁移的位置，主要是看你payload的构造，这里payload是直接写在栈上了，那肯定就是迁移到栈，那要迁移多少，也就是要看你一开始的元素是怎么样的，如果像上面的payload，deadbeef、pop啥的直接往栈顶写了，那就得把rbp的值变成栈顶才能触发溢出；也可以先填充，最后写deadbeef、pop啥的，那此时rbp和rsp就是要指向填充完后有意义的那一段rop的栈上的地址了。我们这里payload都是从栈顶开始布置，所以rbp和rsp都要迁移到栈顶。完整exp如下

![ref10](/assets/images/2025-11-14-zqy-study-note/ref10.png)

这里一共有两次迁移，第一次是泄露libc了然后重新跳转回func_vul继续执行，这一次迁移中，我们把rbp的值减去0x70（0x7ffc5c4a1ed0和0x7ffc5c4a1f40的差距）就能迁移成功，具体是把泄露出来的rbp减去0x70，得到第一段payload迁移的目标stack。

![ref7](/assets/images/2025-11-14-zqy-study-note/ref7.png)

第二次迁移是为了执行execve，我们可以看到第一次泄露出来的栈顶地址是0x7ffec9a77a60（注意下图已经不是上图中执行的那一轮程序了，所以地址会有不同）

![ref11](/assets/images/2025-11-14-zqy-study-note/ref11.png)

然后我们在第一段payload最后返回到func_vul了以后，查看一下栈的结构如何，就可以看到当前的栈顶是0x7ffec9a77a30，和我们之前泄露的地址差了0x30，因此我们迁移的目标就是stack-0x30。

![ref12](/assets/images/2025-11-14-zqy-study-note/ref12.png)

最后getshell

![ref13](/assets/images/2025-11-14-zqy-study-note/ref13.png)

##### 关于栈迁移的其他理解
如图
![ref14](/assets/images/2025-11-14-zqy-study-note/ref14.png)

关于多次迁移的理解，因为迁移完后重新跳转回分配空间的栈溢出函数，rsp回到低位，rbp回到高位，所以要触发溢出的话需要再重新设置rbp指向rsp，这样重新触发ret，让rsp下降来逐个执行栈中指令

![ref15](/assets/images/2025-11-14-zqy-study-note/ref15.png)

![ref16](/assets/images/2025-11-14-zqy-study-note/ref16.png)