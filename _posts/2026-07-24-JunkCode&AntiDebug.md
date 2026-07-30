---
layout: post
title: "[Reverse]花指令与反调试 - JunkCode&AntiDebug"
date: 2026-07-24
categories: [Reverse]
excerpt: "花指令和反调试都是重要的混淆技术。花指令主要反静态分析，通过代码中混入无关指令影响分析；反调试则是通过检测程序调试状态，判断是否在被调试，从而影响动态调试分析"
---


# 花指令 Junk Code

花指令的东西很多很杂，只要是影响IDA自动静态分析的都可以算在里面，这里先讲理论，然后实践分析道题目吧。
## 理论

花指令，其实就是垃圾代码，本身是不会影响程序功能的，其形式很多，这里依据花指令所起到的直接作用来分为以下几类：

### 改变栈平衡型

先说会执行的，一般主要是改变栈，来使IDA无法分析call指令给出反汇编，其本身并不会真正影响栈的值，只是影响分析，比如下面这种形式。

```c
#include <stdio.h>

int main()
{
    _asm {
        push eax;
        add esp, 4;
    }
    printf("Hello World!\n");
}
```

编译的时候需要让编译器不要优化这段代码才能起作用。

又或者，不一定需要执行也可以，比如下面这段JZ必定执行，跳过add操作，但依然会影响IDA分析。

```c
#include <stdio.h>

int main()
{
    _asm {
        xor eax, eax;
        jz s;
        add esp, 0x11;
    s:
    }
    printf("Hello World!\n");
}
```

破坏栈还有另一种形式，这里通过call进入xxx函数，但是xxx的内容却是改变esp指向的值后立即返回：首先call会压入下一条指令的地址，而下一条指令就在xxx函数内，是add指令；执行完add指令后，esp指向的内容--即原本要返回的下一条指令的地址被改变，正好变成了call printf的地址，最后retn直接返回到printf，因此其本质就是执行了一次跳转，直接跳转到下一个指令。通过这种方式，我们可以跳转到任何地方。

```c
#include <stdio.h>

int main()
{
    _asm {
        call xxx
    xxx:
        add [esp], 0x7
        retn
        _emit 0x12
        _emit 0x34
    }
    printf("Hello World!\n");
}
```

对于这类混淆，我们直接把其栈相关的指令用nop指令替换即可。

### 操作码操作数混淆型

比如下面这样的，条件跳转必定满足、必定执行跳转代码从而跳过中间的指令的操作，但是中间这些无意义的操作码与操作数就会导致IDA静态分析失败。也是直接nop。

```c
#include <stdio.h>

int main()
{
    _asm {
        xor eax, eax;
        jz xxx;
        _emit 0x11;
        _emit 0x22;
        _emit 0x33; // 0x33是 xor 指令的操作码
    xxx:
    }
    printf("Hello World!\n");
}
```

### 跳转混淆型

比如左右横跳的，跳转的两条指令都要nop，或者nop掉一条，另一条改成jmp

```c
#include <stdio.h>

int main()
{
    _asm {
		jb xxx;
		jnb xxx;
    xxx:
    }
    printf("Hello World!\n");
}
```

还有错位跳转，可以看到跳转的指令刚好在下一条指令的中间某个位置，需要先把指令undefine了再按跳转的实际位置重新定义，然后把无关的指令nop。

```assembly
.text:0040161F                 jmp     short near ptr loc_40161F+1
.text:0040161F ; ---------------------------------------------------
.text:00401621                 db 0C0h, 48h, 0A1h
.text:00401624                 dd offset __imp___iob
```

除了上述几种花指令，还有很多设计更精密的既具备实际功能又具备混淆功能的指令，这里就不完全列举了；对抗花指令主要靠分析程序流，发现真正执行的命令，nop掉其它命令，总体是比较好破的，依靠动态分析能解决很多问题。

## 实践

接下来来一道题目看看如何分析，这题一开始跟着start函数跳转到main，却发现f5怎么也按不动，也无法切换到graph模式，搜索也搜不到main函数，这是因为IDA无法识别main函数的边界，所以没有把它视为函数，我们需要手动创建函数，把属于main的部分选中（自己判断哪部分可能属于main，可以找leave+retn作为判断边界），然后使用IDA的create function功能。

![ref1](/assets/images/2026-07-24-JunkCode&AntiDebug/ref1.png)

然后就可以反汇编main了，但是发现strcpy之后就没有了。

![ref2](/assets/images/2026-07-24-JunkCode&AntiDebug/ref2.png)

这是因为0x98B处有花指令，这个就属于左右横跳+错位跳转，同时使用jb和jnb那就是必定跳转，同时跳转的位置是loc_98F+1也就是0x990，但是0x98F是一条指令，其下一条指令又是在0x991，跳转会跳转到这条指令的中间。

![ref3](/assets/images/2026-07-24-JunkCode&AntiDebug/ref3.png)

方法是选中loope这一整条指令（别用鼠标直接点这条指令，不然IDA之后的操作会对这条指令所在的区块的所有指令进行操作），然后右键undefine，再对jb和jnb跳转的位置0x990重新创建代码，这样右边反汇编一下就好了，之后把剩下的0x98f的db 0e1h直接nop就好，nop使用插件来nop，不同机器码占的长度不同，nop是0x90，常常比nop之前的指令长度短，插件可以帮我们把多余的操作数进行填充，这样就不需要一个个改。。

![ref4](/assets/images/2026-07-24-JunkCode&AntiDebug/ref4.png)

之后还有一个地方是错位跳转的，跳到0xadd，但是0xadc是一条指令，0xadd在其内部

![ref5](/assets/images/2026-07-24-JunkCode&AntiDebug/ref5.png)

也是一样的，先undefine，然后按c转为code，然后nop。改完发现还有，但是这次问题出在call指令而不是jmp了。0xC22这块地方存在某种问题。

![ref6](/assets/images/2026-07-24-JunkCode&AntiDebug/ref6.png)

这是因为我之前在创建main函数时，范围选多了，把0xC22也选进main函数了，导致IDA对0xC22位置的函数分析失败，重新调整main范围即可

![ref7](/assets/images/2026-07-24-JunkCode&AntiDebug/ref7.png)

IDA不会直接对原文件进行修改，一般来说，在IDA里的操作都是对IDA的数据库进行操作，想要获得patch后的程序，得在IDA里选择Apply patches to input file然后保存为新应用，分析完后的main：

```c
void __fastcall main(int a1, char **a2, char **a3)
{
  char v3; // [rsp+10Fh] [rbp-151h]
  int v4; // [rsp+110h] [rbp-150h]
  int v5; // [rsp+114h] [rbp-14Ch]
  char *v6; // [rsp+118h] [rbp-148h]
  char v7[10]; // [rsp+126h] [rbp-13Ah] BYREF
  _QWORD v8[2]; // [rsp+130h] [rbp-130h] BYREF
  int v9; // [rsp+140h] [rbp-120h]
  _QWORD v10[3]; // [rsp+150h] [rbp-110h] BYREF
  char v11; // [rsp+168h] [rbp-F8h]
  _QWORD v12[3]; // [rsp+170h] [rbp-F0h] BYREF
  char v13; // [rsp+188h] [rbp-D8h]
  _QWORD v14[6]; // [rsp+190h] [rbp-D0h] BYREF
  __int16 v15; // [rsp+1C0h] [rbp-A0h]
  char v16[136]; // [rsp+1D0h] [rbp-90h] BYREF
  unsigned __int64 v17; // [rsp+258h] [rbp-8h]

  v17 = __readfsqword(0x28u);
  v4 = 0;
  memset(v10, 0, sizeof(v10));
  v11 = 0;
  memset(v12, 0, sizeof(v12));
  v13 = 0;
  memset(v14, 0, sizeof(v14));
  v15 = 0;
  strcpy(
    v16,
    "**************.****.**s..*..******.****.***********..***..**..#*..***..***.********************.**..*******..**...*..*.*.**.*");
  v8[0] = 0;
  v8[1] = 0;
  v9 = 0;
  v6 = &v16[22];
  strcpy(v7, "sctf_9102");
  puts("plz tell me the shortest password1:");
  scanf("%s", v14);
  v5 = 1;
  while ( v5 )
  {
    v3 = *((_BYTE *)v14 + v4);
    switch ( v3 )
    {
      case 'w':
        v6 -= 5;
        break;
      case 's':
        v6 += 5;
        break;
      case 'd':
        ++v6;
        break;
      case 'a':
        --v6;
        break;
      case 'x':
        v6 += 25;
        break;
      case 'y':
        v6 -= 25;
        break;
      default:
        v5 = 0;
        break;
    }
    ++v4;
    if ( *v6 != 46 && *v6 != 35 )
      v5 = 0;
    if ( *v6 == 35 )
    {
      puts("good!you find the right way!\nBut there is another challenge!");
      break;
    }
  }
  if ( v5 )
  {
    puts("plz tell me the password2:");
    scanf("%s", v10);
    sub_C22((const char *)v10, (__int64)v12);
    if ( (unsigned int)sub_F67((const char *)v12, v7) == 1 )
    {
      puts("Congratulation!");
      puts("Now,this is the last!");
      puts("plz tell me the password3:");
      scanf("%s", v8);
      if ( (unsigned int)sub_FFA((char *)v8) == 1 )
      {
        puts("Congratulation!Here is your flag!:");
        printf("sctf{%s-%s(%s)}", (const char *)v14, (const char *)v10, (const char *)v8);
      }
      else
      {
        printf("something srong...");
      }
    }
    else
    {
      printf("sorry,somthing wrong...");
    }
  }
  else
  {
    printf("sorry,is't not a right way...");
  }
}
```

# 反调试 Anti-Debug

反调试比花指令花哨很多，整个反调试可以分为两部分，一部分是检测程序调试状态，一部分是针对调试状态做出对应响应。下面先梳理一下反调试特征。

## 理论

检测反调试有很多种方法，首先比较简单直接的就是直接调用系统的函数、接口等来检测调试状态。对于linux而言，常常会检测`/proc/self/status`、`ptrace(PTRACE_TRACEME)`，windows则是会使用`IsDebuggerPresent()`、`CheckRemoteDebuggerPresent()`、`NtQueryInformationProcess()`来检测。在逆向的时候可以搜索字符串或者import表，看到这些就知道有反调试了。

![ref8](/assets/images/2026-07-24-JunkCode&AntiDebug/ref8.png)

windows中每个进程还有进程环境块PEB，是用来记录每一个进程相关信息的结构体，这其中就包括BeingDebugged，程序也可以通过检测PEB来判断，再高级一点的，NTGlobalFlag，调试器创建的程序和正常启动的程序这个值会不一样。

扩大到整体来讲，调试创建的程序和正常创建的程序总会有点不一样的，所以总的检测调试的思路，就是去检测哪里不同。比如，想要调试程序，调试器就必须开着吧，别管它当前是不是在调试程序，程序完全可以写成检测当前是否有调试进程名字来进行反调试，虽然会误伤，所以更高级的是检测调试进程的更多特征，比如固定的特征字节。

调试的时候，往往会下断点，然后步过，由此衍生出断点检测和针对步过的时间检测。首先软件断点的原理，其实是通过修改代码中要下断点的指令为INT 3，触发软件异常，然后由调试器捕获异常；硬件断点则好一点不用修改，而是使用调试寄存器`DR0~DR7`直接给CPU下指令，执行到某个位置自动触发异常。但两者都是可以被程序检测的，前者因为修改代码很容易就被检测到，后者则可以通过检测调试寄存器的值来判断。时间检测则可以检测两条指令之间运行的时间，比如使用x86的`rdtsc`指令读取开始和结束的时间戳来判断，在IDA中看到这条指令很可能也意味着检测时间。总而言之，和花指令一样，反调试的技术也是多种多样的。

## 实践

下面找了一道windows的anti-debug的题目，`SecCon 2016 - anti-debugging`。F5之后先发现sp的值分析错误，也就是main函数的反汇编可能是错的。但是总体逻辑看了挺简单的，就是输入密码`I have a pen.`就通过验证，但是通过验证以后什么也没有。同时通过看看反汇编的代码，已经可以发现一堆反debug的技术了。

![ref9](/assets/images/2026-07-24-JunkCode&AntiDebug/ref9.png)

先解决分析问题，用IDA的栈指针差值SPD（Stack Pointer Delta）来分析每一步的栈变化，可以发现两个事情，一是在0x40176e处，SPD的值为负了，即当前SP的值是正的（positive sp value），然后这期间还有一个很奇怪的事情是部分代码的SPD只有4；二是出现了call MessageBox，也就是windows的弹窗，但是这个之前反编译没有出来。

![ref11](/assets/images/2026-07-24-JunkCode&AntiDebug/ref11.png)

往前追溯一下是谁对esp指针动手了，就可以发现0x4015f6处还原了旧的esp，然后突然就变成4了，而这个值是0x401326的时候mov指令保存的，IDA的静态分析很难处理`mov reg, [mem_addr]`的情况，因为IDA静态分析默认不会维护完整的内存状态，对于`mov esp, [ebp+ms_exc.old_esp]`这种涉及到根据内存修改栈指针的运算来说，esp的值在IDA的分析里就会变为无法确定的。但是可以通过动态调试确定这个esp的值，这下知道题目为什么要反调试了。

![ref12](/assets/images/2026-07-24-JunkCode&AntiDebug/ref12.png)

接下来就是一层层的破除反调试了，确定好esp的变化后，就能恢复出完整的反汇编代码，然后分析出逻辑了，不过其实最后可以知道MessageBox是打印真正的flag的，直接patch一下jmp到这里就能获取flag了。

直接看，第一个反debug的是windows的函数IsDebuggerPresent，程序通过判断IsDebuggerPresent的输出来确定有没有debug，有就exit

![ref13](/assets/images/2026-07-24-JunkCode&AntiDebug/ref13.png)

这种最好弄，修改最后的跳转jnz逻辑横真即可，或者修改cmp判断结果，反正随便改改就能绕开，这里我改cmp和0比较，比把jnz改成jmp等其它指令好，这样改的字节数少，不容易出问题。

![ref14](/assets/images/2026-07-24-JunkCode&AntiDebug/ref14.png)

下一个，检测NtGlobalFlag是不是0x70，这就是之前说的检测PEB情况，0x70就代表开了。我们也是直接改cmp比较内容，随便改就绕过了。下一个CheckRemoteDebuggerPresent同理，改完以后程序像这样：

![ref15](/assets/images/2026-07-24-JunkCode&AntiDebug/ref15.png)

下一个是时间检测，GetTickCount也是一个获取时间戳的函数，这里短短两个位置分别调用两次，随后计算这两个值的差，并判断是不是特别大，也是改cmp就好了，改成和一个很大的值对比。

![ref16](/assets/images/2026-07-24-JunkCode&AntiDebug/ref16.png)

后半的检测就不一一说了，解法都是patch cmp，这里有检测微软进程工具的，检测IDA、Ollydbg这些调试软件的，还有检测vmware的，其实这些检测都是发现了直接patch就可以了，

![ref17](/assets/images/2026-07-24-JunkCode&AntiDebug/ref17.png)

值得一说的是最后的SEH，也就是

```c
#这里其实因为sp的原因不是完整的代码，可以看到好像都没见到判断逻辑
pbDebuggerPresent[2] = 1;
pbDebuggerPresent[5] = 1;
pbDebuggerPresent[4] = 1 / 0;
ms_exc.registration.TryLevel = -2;
printf("But detected Debugged.\n");
```

全程叫结构化异常处理反调试，靠的是异常处理在调试时和正常运行时走的逻辑不同，在有调试器时，异常会由调试器处理。而正常运行这个exe，除0触发错误后，会由windows系统进行异常分发，然后由SEH handler接管异常，程序继续执行，此时`pbDebuggerPresent[2]`的值就会更改，不再为1，那么如果检测到其值没变，就说明有调试器，完整逻辑都在汇编里，检测的值就是这个var 88。

![ref18](/assets/images/2026-07-24-JunkCode&AntiDebug/ref18.png)

最后改esp还是过于麻烦了，我也是选择直接动态调试确定分支，最后直接跳转的形式了。patch一下直接能在main中看到处理逻辑，并且直接打印flag。

![ref19](/assets/images/2026-07-24-JunkCode&AntiDebug/ref19.png)

# 总结

花指令靠动态调试nop掉花指令，反调试靠静态分析nop掉反调试。分析问题的关键在于找出哪里有花指令和哪里有反调试。
