---
layout: post
title: "[Reverse]AES与CBC分组加密算法逆向"
date: 2026-07-15
categories: [Reverse]
---
分组加密和序列加密都属于对称加密的方法，序列加密中，直接使用一个较短的密钥去生成和原文等长的密钥流，然后用密钥流去加密明文；分组加密则是将明文分组处理，这样就无须把密钥拓展到与明文等长，同时分块也更易于传输、易于并行处理等。

分组加密有多种模式，分组加密算法本身通常只对一个块进行加密处理，想要加密整个明文，需要按照分组加密的模式去组织加密过程，这些模式有ECB、CBC、OCF、CFB、CTR，其中ECB就是直接的分组，用密钥对每个分组直接加密，分组之间没有联系，这样的加密模式不能隐藏明文中的统计规律，也不能抵抗替换攻击，其他几个的分组模式则对此做了改进，保证了不同分组之间是有一定联系的，具体的改进很多密码学文献都有详细介绍，这里略。总之，现在使用最多的是CBC模式，其既保证了安全性，同时也具备较小的性能开销，因此，本文主要基于CBC模式，同时讲解一个常与CBC模式使用的分组加密算法AES。

# CBC

先来张图片看看CBC模式的加解密，

![ref1](/assets/images/2026-07-15-AES-Reverse/ref1.png)

在CBC中，除了密钥，还会使用一个叫初始化向量的东西，即图中的IV，IV可以公开，但应该取随机值。在加密时，IV用来异或第一个明文块，后续的明文块则和前一个加密块的内容异或；解密时，IV则可以得到第一个明文块。可以看出来，CBC中的前一块的内容会对后面的加密产生影响，而IV的使用就是因为第一块明文没有前一块。

# AES

AES即高级加密标准，全称Advanced Encryption Standard，由美国NIST于2001年发布，目标是代替DES。

AES的分组长度固定为128位，密钥长度则有128、192、256位三种选择，依据不同长度的密钥其加密轮数、拓展密钥大小也不同，下面先来讲讲AES加解密过程。

AES不采用Feistel的轮换结构了，而是基于替换-置换网络（SPN）结构，并且采用多轮的加密。整个过程可以分为前期准备与加密两个步骤。下面简单讲讲吧。

## 前期准备

首先要对明文进行分组与填充，将明文分为128位的块，如果块不够128则填充，填充标准常采用`PKCS#7`，即缺几个字节，就填充几个该数字的字节，比如缺5字节，则填充5个0x05。

接下来，对于每个128位明文块，都需要按列优先加载进`4 * 4`字节的状态矩阵State，后续的加密都是对该矩阵做操作。

最后是做密钥拓展，这里的密钥拓展，说的不是拓展密钥的位数，而是拓展密钥的数量，AES采用多轮加密，每一轮都用不同的密钥，因此需要将初始的128/192/256位的密钥，拓展成n个（n是总轮数，包含三个阶段的轮，分别取11、13、15）128/192/256位的轮密钥，拓展过程，是将初始密钥用递推公式进行异或、移位，按字（Word，4字节）来逐个生成拓展密钥数组W，具体公式可以在网上找到。

## 加密

加密可以三种轮，初始轮、标准轮、最终轮，不同轮执行的过程不一样，不同密钥长度影响的是标准轮的轮数，接下来都以128位为例子，初始轮占1轮，标准轮占9轮，最终轮占1轮，一共11轮。不同轮做的变换如下，

初始轮，只是做轮密钥加（AddRoundKey），将初始的状态矩阵State与第0个轮密钥按位异或，第一轮因为基本没做什么，所以很多时候统计轮数时并不算入第一轮，因此也有AES-128、AES-192、AES-256分别加密10轮、12轮、14轮的说法。

标准轮，先进行字节替换（SubBytes），将状态矩阵的每个字节按S盒替换成另一个字节，AES的S盒与RC4的不同，不是通过密钥生成的，不经过变换操作，而是一个固定的矩阵，其值是精心设计的因此一般不会随意改变，大小也固定是256字节，也因此是逆向AES的一个重要特征；然后进行行移位（ShiftRows）、列混淆（MixColumns），行移位就是字面意思，列混淆则是用状态矩阵的每一列与一个固定的矩阵相乘，最后也进行轮密钥加。

S盒的值如下图。

![ref2](/assets/images/2026-07-15-AES-Reverse/ref2.png)

最终轮，只执行字节替换，行移位，轮密钥加。

所有轮执行完后，把状态矩阵重新映射回数据块。

## 解密

解密也可以分为前期准备与解密，不过总体简单许多。对于前期准备，首先也是把密文重新载入状态矩阵，然后重新根据密钥生成轮密钥，轮密钥在解密的时候用的顺序要反过来。

解密时，也是分初始、标准、最终三轮，同时由于轮密钥加是异或操作，所以也可以直接使用，对于其它操作，则需要分别对应逆列混淆--乘上之前固定矩阵的逆矩阵，逆行移位，逆字节替换--使用逆S盒。做完后回复状态矩阵为明文。

完整的加解密实现比较复杂，这里就不贴代码了。比较常见的调用风格是这样的：

```c
AES_CTX ctx;
AES_init(&ctx, key, iv);
AES_CBC_encrypt(&ctx, plain, sizeof(plain));
```

这是许多轻量库的调用风格，包含一个维护轮密钥、IV的上下文变量ctx，初始化ctx的函数，以及一个使用CBC模式进行AES加密的函数

# 逆向CBC模式的AES

首先，逆向的总体思路是先判断出AES算法，如果是AES算法，那么接下来先判断它使用的分组模式，如果是CBC这类带反馈的模式，就再去找IV，最后解密。以及如果是CTF的话，这类算法逆向通常还会写死输入的长度，让你只能输入64字节什么的，这种也可以成为一种提示。当然，如果是按上一节说的那种调用风格来的话，基本看到就知道是CBC了。现在随便找一题。

主函数：

```c
int __fastcall main(int argc, const char **argv, const char **envp)
{
  int i; // [rsp+20h] [rbp-208h]
  __int64 v5; // [rsp+28h] [rbp-200h]
  __int64 v6; // [rsp+30h] [rbp-1F8h]
  unsigned __int64 v7; // [rsp+38h] [rbp-1F0h]
  _BYTE v8[192]; // [rsp+70h] [rbp-1B8h] BYREF
  _BYTE v9[16]; // [rsp+130h] [rbp-F8h] BYREF
  _BYTE v10[14]; // [rsp+140h] [rbp-E8h] BYREF
  _BYTE v11[2]; // [rsp+14Eh] [rbp-DAh] BYREF
  _BYTE Buf2[16]; // [rsp+150h] [rbp-D8h] BYREF
  _BYTE v13[29]; // [rsp+160h] [rbp-C8h] BYREF
  _BYTE v14[3]; // [rsp+17Dh] [rbp-ABh] BYREF
  char v15[8]; // [rsp+180h] [rbp-A8h] BYREF
  char v16[40]; // [rsp+188h] [rbp-A0h] BYREF
  _BYTE Buf1[16]; // [rsp+1B0h] [rbp-78h] BYREF
  char v18[32]; // [rsp+1C0h] [rbp-68h] BYREF
  char Buffer[40]; // [rsp+1E0h] [rbp-48h] BYREF

  Buf2[0] = 80;
  Buf2[1] = -112;
  Buf2[2] = 93;
  Buf2[3] = 123;
  Buf2[4] = 34;
  Buf2[5] = 22;
  Buf2[6] = -65;
  Buf2[7] = -20;
  Buf2[8] = -53;
  Buf2[9] = 91;
  Buf2[10] = 65;
  Buf2[11] = 1;
  Buf2[12] = 99;
  Buf2[13] = 87;
  Buf2[14] = 23;
  Buf2[15] = 107;
  input(byte_1400045BC, v15, envp);
  v5 = -1;
  do
    ++v5;
  while ( v15[v5] );
  sub_140001FE0(v15, v5, Buf1);
  qmemcpy(v10, "+~", 2);
  v10[2] = 21;
  v10[3] = 22;
  v10[4] = 40;
  v10[5] = -82;
  v10[6] = -46;
  v10[7] = -90;
  v10[8] = -85;
  v10[9] = -9;
  v10[10] = 21;
  v10[11] = -120;
  v10[12] = 9;
  v10[13] = -49;
  qmemcpy(v11, "O<", sizeof(v11));
  v13[0] = -119;
  v13[1] = -19;
  v13[2] = 35;
  v13[3] = 110;
  v13[4] = 72;
  v13[5] = -2;
  v13[6] = 92;
  v13[7] = 20;
  v13[8] = 64;
  v13[9] = 39;
  v13[10] = 66;
  v13[11] = 122;
  v13[12] = -12;
  v13[13] = -74;
  v13[14] = -13;
  v13[15] = -113;
  v13[16] = -106;
  v13[17] = 40;
  v13[18] = 48;
  v13[19] = -65;
  v13[20] = -3;
  v13[21] = 65;
  v13[22] = 43;
  v13[23] = -80;
  v13[24] = -42;
  v13[25] = -2;
  v13[26] = 61;
  v13[27] = -54;
  v13[28] = -41;
  qmemcpy(v14, "z1z", sizeof(v14));
  v9[0] = 0;
  v9[1] = 1;
  v9[2] = 2;
  v9[3] = 3;
  v9[4] = 4;
  v9[5] = 5;
  v9[6] = 6;
  v9[7] = 7;
  v9[8] = 8;
  v9[9] = 9;
  v9[10] = 10;
  v9[11] = 11;
  v9[12] = 12;
  v9[13] = 13;
  v9[14] = 14;
  v9[15] = 15;
  memset(v16, 0, 33u);
  memset(v18, 0, sizeof(v18));
  input("%32s", v16);
  v6 = -1;
  do
    ++v6;
  while ( v16[v6] );
  if ( v6 != 32 )
    return -1;
  qmemcpy(v18, v16, sizeof(v18));
  sub_140001590(v8, v10, v9);
  sub_140001E60(v8, v18, 32);
  memset(Buffer, 0, 33u);
  if ( !memcmp(Buf1, Buf2, 16u) && !memcmp(v13, v18, 0x20u) )
  {
    for ( i = 0; i < 32; ++i )
    {
      v7 = -1;
      do
        ++v7;
      while ( v15[v7] );
      Buffer[i] = v15[i % v7] ^ v16[i] ^ 0x43;
    }
    puts("SUCCESS");
    puts(Buffer);
  }
  else
  {
    sub_140001060("FAILURE!\n");
  }
  return 0;
}
```

打开主函数，一个个sub_xxx的看过去，然后有byte_xxx的点开看看，这里很明显就是AES的S盒了，0x63，0x7c，0x77 。。。

![ref3](/assets/images/2026-07-15-AES-Reverse/ref3.png)

此外，点开sub_140001FE0，还可以看到四个明显的常量，这个明显是MD5的四个IV，所以这题还用到了MD5

![ref4](/assets/images/2026-07-15-AES-Reverse/ref4.png)

再看看sub_140001E60，

```c
__int64 __fastcall sub_140001E60(__int64 a1, char *a2, unsigned __int64 a3)
{
  __int64 result; // rax
  unsigned __int64 i; // [rsp+20h] [rbp-28h]
  const void *v5; // [rsp+28h] [rbp-20h]

  v5 = (const void *)(a1 + 176);
  for ( i = 0; i < a3; i += 16LL )
  {
    sub_140001E00(a2, v5);
    sub_140001D70(a2, a1);
    v5 = a2;
    a2 += 16;
  }
  result = a1;
  qmemcpy((void *)(a1 + 176), v5, 0x10u);
  return result;
}
```

其中sub_140001E00，里面的核心操作只有异或

```c
__int64 __fastcall sub_140001E00(__int64 a1, __int64 a2)
{
  __int64 result; // rax
  unsigned __int8 i; // [rsp+0h] [rbp-18h]

  for ( i = 0; ; ++i )
  {
    result = i;
    if ( i >= 16u )
      break;
    *(_BYTE *)(a1 + i) ^= *(_BYTE *)(a2 + i);
  }
  return result;
}
```

与sub_140001D70，这个sub_140001D70就有更明显的AES加密特征了，可以看到for循环里面有4个函数，而for循环执行到第十次时，只会做其中两个，对应到AES-128，第11轮（按初始轮是第1轮来算）也就是最终轮，只执行字节替换、行移位、轮密钥加，少了一个列混合。并且开头有一个sub_1400015e0，循环体也有，最终结束也有，对应了每一轮都要做的轮密钥加

```c
__int64 __fastcall sub_140001D70(__int64 a1, __int64 a2)
{
  __int64 v2; // rcx
  unsigned __int8 i; // [rsp+20h] [rbp-18h]

  sub_1400015E0(0, a1, a2);
  for ( i = 1; ; ++i )
  {
    sub_140001690(a1);
    sub_140001710(a1);
    if ( i == 10 )
      break;
    sub_140001A80(a1);
    sub_1400015E0(i, a1, a2);
  }
  LOBYTE(v2) = 10;
  return sub_1400015E0(v2, a1, a2);
}
```

此处，sub_1400015e0可以看到是异或操作，刚好对应轮密钥加

```c
__int64 __fastcall sub_1400015E0(unsigned __int8 a1, __int64 a2, __int64 a3)
{
  __int64 result; // rax
  unsigned __int8 j; // [rsp+0h] [rbp-18h]
  unsigned __int8 i; // [rsp+1h] [rbp-17h]

  for ( i = 0; ; ++i )
  {
    result = i;
    if ( i >= 4u )
      break;
    for ( j = 0; j < 4u; ++j )
      *(_BYTE *)(a2 + 4LL * i + j) ^= *(_BYTE *)(a3 + j + 4 * i + 16 * a1);
  }
  return result;
}
```

sub_140001690对应字节替换，这里用byte_140004660的数组进行替换，而这个位置也就是上面发现的S盒。

```c
__int64 __fastcall sub_140001690(__int64 a1)
{
  __int64 result; // rax
  unsigned __int8 j; // [rsp+0h] [rbp-18h]
  unsigned __int8 i; // [rsp+1h] [rbp-17h]

  for ( i = 0; ; ++i )
  {
    result = i;
    if ( i >= 4u )
      break;
    for ( j = 0; j < 4u; ++j )
      *(_BYTE *)(a1 + 4LL * j + i) = byte_140004660[*(unsigned __int8 *)(a1 + 4LL * j + i)];
  }
  return result;
}
```

sub_140001710对应行移位

```c
_BYTE *__fastcall sub_140001710(_BYTE *a1)
{
  _BYTE *result; // rax
  char v2; // [rsp+0h] [rbp-18h]
  char v3; // [rsp+0h] [rbp-18h]
  char v4; // [rsp+0h] [rbp-18h]
  char v5; // [rsp+0h] [rbp-18h]

  v2 = a1[1];
  a1[1] = a1[5];
  a1[5] = a1[9];
  a1[9] = a1[13];
  a1[13] = v2;
  v3 = a1[2];
  a1[2] = a1[10];
  a1[10] = v3;
  v4 = a1[6];
  a1[6] = a1[14];
  a1[14] = v4;
  v5 = a1[3];
  a1[3] = a1[15];
  a1[15] = a1[11];
  a1[11] = a1[7];
  result = a1 + 4;
  a1[7] = v5;
  return result;
}
```

列混合。。。

```c
__int64 __fastcall sub_140001A80(__int64 a1)
{
  __int64 result; // rax
  unsigned __int8 i; // [rsp+20h] [rbp-18h]
  char v3; // [rsp+22h] [rbp-16h]
  char v4; // [rsp+23h] [rbp-15h]

  for ( i = 0; ; ++i )
  {
    result = i;
    if ( i >= 4u )
      break;
    v4 = *(_BYTE *)(a1 + 4LL * i);
    v3 = *(_BYTE *)(a1 + 4LL * i + 3) ^ *(_BYTE *)(a1 + 4LL * i + 2) ^ *(_BYTE *)(a1 + 4LL * i + 1) ^ v4;
    *(_BYTE *)(a1 + 4LL * i) = v3 ^ sub_140001A60((unsigned __int8)(*(_BYTE *)(a1 + 4LL * i + 1) ^ v4)) ^ v4;
    *(_BYTE *)(a1 + 4LL * i + 1) ^= v3
                                  ^ (unsigned __int8)sub_140001A60((unsigned __int8)(*(_BYTE *)(a1 + 4LL * i + 2)
                                                                                   ^ *(_BYTE *)(a1 + 4LL * i + 1)));
    *(_BYTE *)(a1 + 4LL * i + 2) ^= v3
                                  ^ (unsigned __int8)sub_140001A60((unsigned __int8)(*(_BYTE *)(a1 + 4LL * i + 3)
                                                                                   ^ *(_BYTE *)(a1 + 4LL * i + 2)));
    *(_BYTE *)(a1 + 4LL * i + 3) ^= v3
                                  ^ (unsigned __int8)sub_140001A60((unsigned __int8)(v4 ^ *(_BYTE *)(a1 + 4LL * i + 3)));
  }
  return result;
}
```

知道这些后，就可以重新命名一下，好看一点，这样逻辑就清晰多了

```c
__int64 __fastcall sub_140001D70(__int64 a1, __int64 a2)
{
  __int64 v2; // rcx
  unsigned __int8 i; // [rsp+20h] [rbp-18h]

  Add_Roundkeys(0, a1, a2);
  for ( i = 1; ; ++i )
  {
    SubBytes(a1);
    ShiftRows(a1);
    if ( i == 10 )
      break;
    MixColumns(a1);
    Add_Roundkeys(i, a1, a2);
  }
  LOBYTE(v2) = 10;
  return Add_Roundkeys(v2, a1, a2);
}
```

sub_140001D70也可以重新命名为AES_encrypt，之前我们还看到了另一个核心操作只有异或的函数sub_140001E00，既然它不是轮密钥加，那么就是对应CBC加密时，用初始向量以及前一个加密块去异或后一块明文的步骤了，可以发现整个sub_140001E600就是CBC的分组模式，i的步进是16，对应的应该是AES是对`4*4`一共16字节的状态矩阵，同时也是128位的明文分组大小。

a3是明文的总长度，a2对应的应该是明文输入，v5是异或用的向量，取值一开始是从a1中取的，后面是取自加密后的a2，那么a1代表的就是AES的上下文，包含轮密钥（176也对应11个轮密钥乘密钥长度16字节）与初始化IV，都对得上，而且这里没有轮密钥之类的初始化过程，那么在主函数中，这个函数的前一个函数就是AES的初始化了。

```c
__int64 __fastcall sub_140001E60(__int64 a1, char *a2, unsigned __int64 a3)
{
  __int64 result; // rax
  unsigned __int64 i; // [rsp+20h] [rbp-28h]
  const void *v5; // [rsp+28h] [rbp-20h]

  v5 = (const void *)(a1 + 176);
  for ( i = 0; i < a3; i += 16LL )
  {
    cbc_xor(a2, v5);
    AES_encrypt(a2, a1);
    v5 = a2;
    a2 += 16;
  }
  result = a1;
  qmemcpy((void *)(a1 + 176), v5, 0x10u);
  return result;
}
```

逆向完后的main函数是这样，虽然东西多，但是逻辑很明显了，一共有两次输入，两次memcmp，第一次输入用MD5处理以后，对比程序里的Buf2数组，第二次输入用AES加密处理对比程序里的v13数组，这两个都取出来即可。从AES_init的流程来看，传入的v10就是密钥，v9就是IV，因此可以直接解题。

```c
int __fastcall main(int argc, const char **argv, const char **envp)
{
  int i; // [rsp+20h] [rbp-208h]
  unsigned __int64 input1_length; // [rsp+28h] [rbp-200h]
  __int64 input2_length; // [rsp+30h] [rbp-1F8h]
  unsigned __int64 v7; // [rsp+38h] [rbp-1F0h]
  _BYTE v8[192]; // [rsp+70h] [rbp-1B8h] BYREF
  _BYTE v9[16]; // [rsp+130h] [rbp-F8h] BYREF
  _BYTE v10[14]; // [rsp+140h] [rbp-E8h] BYREF
  _BYTE v11[2]; // [rsp+14Eh] [rbp-DAh] BYREF
  _BYTE Buf2[16]; // [rsp+150h] [rbp-D8h] BYREF
  _BYTE v13[29]; // [rsp+160h] [rbp-C8h] BYREF
  _BYTE v14[3]; // [rsp+17Dh] [rbp-ABh] BYREF
  char input1[8]; // [rsp+180h] [rbp-A8h] BYREF
  char input2[40]; // [rsp+188h] [rbp-A0h] BYREF
  _BYTE input1_MD5[16]; // [rsp+1B0h] [rbp-78h] BYREF
  char v18[32]; // [rsp+1C0h] [rbp-68h] BYREF
  char Buffer[40]; // [rsp+1E0h] [rbp-48h] BYREF

  Buf2[0] = 80;
  Buf2[1] = -112;
  Buf2[2] = 93;
  Buf2[3] = 123;
  Buf2[4] = 34;
  Buf2[5] = 22;
  Buf2[6] = -65;
  Buf2[7] = -20;
  Buf2[8] = -53;
  Buf2[9] = 91;
  Buf2[10] = 65;
  Buf2[11] = 1;
  Buf2[12] = 99;
  Buf2[13] = 87;
  Buf2[14] = 23;
  Buf2[15] = 107;
  scanf(Format, input1, envp);
  input1_length = -1;
  do
    ++input1_length;
  while ( input1[input1_length] );
  MD5(input1, input1_length, (__int64)input1_MD5);
  qmemcpy(v10, "+~", 2);
  v10[2] = 21;
  v10[3] = 22;
  v10[4] = 40;
  v10[5] = -82;
  v10[6] = -46;
  v10[7] = -90;
  v10[8] = -85;
  v10[9] = -9;
  v10[10] = 21;
  v10[11] = -120;
  v10[12] = 9;
  v10[13] = -49;
  qmemcpy(v11, "O<", sizeof(v11));
  v13[0] = -119;
  v13[1] = -19;
  v13[2] = 35;
  v13[3] = 110;
  v13[4] = 72;
  v13[5] = -2;
  v13[6] = 92;
  v13[7] = 20;
  v13[8] = 64;
  v13[9] = 39;
  v13[10] = 66;
  v13[11] = 122;
  v13[12] = -12;
  v13[13] = -74;
  v13[14] = -13;
  v13[15] = -113;
  v13[16] = -106;
  v13[17] = 40;
  v13[18] = 48;
  v13[19] = -65;
  v13[20] = -3;
  v13[21] = 65;
  v13[22] = 43;
  v13[23] = -80;
  v13[24] = -42;
  v13[25] = -2;
  v13[26] = 61;
  v13[27] = -54;
  v13[28] = -41;
  qmemcpy(v14, "z1z", sizeof(v14));
  v9[0] = 0;
  v9[1] = 1;
  v9[2] = 2;
  v9[3] = 3;
  v9[4] = 4;
  v9[5] = 5;
  v9[6] = 6;
  v9[7] = 7;
  v9[8] = 8;
  v9[9] = 9;
  v9[10] = 10;
  v9[11] = 11;
  v9[12] = 12;
  v9[13] = 13;
  v9[14] = 14;
  v9[15] = 15;
  memset(input2, 0, 33u);
  memset(v18, 0, sizeof(v18));
  scanf("%32s", input2);
  input2_length = -1;
  do
    ++input2_length;
  while ( input2[input2_length] );
  if ( input2_length != 32 )
    return -1;
  qmemcpy(v18, input2, sizeof(v18));
  AES_init((__int64)v8, (__int64)v10, v9);
  AES_CBC_enc((__int64)v8, v18, 0x20u);
  memset(Buffer, 0, 33u);
  if ( !memcmp(input1_MD5, Buf2, 16u) && !memcmp(v13, v18, 0x20u) )
  {
    for ( i = 0; i < 32; ++i )
    {
      v7 = -1;
      do
        ++v7;
      while ( input1[v7] );
      Buffer[i] = input1[i % v7] ^ input2[i] ^ 0x43;
    }
    puts("SUCCESS");
    puts(Buffer);
  }
  else
  {
    sub_140001060("FAILURE!\n");
  }
  return 0;
}
```

最后：

可以解出来md5是1314

![ref5](/assets/images/2026-07-15-AES-Reverse/ref5.png)

输入的明文是01234567891234560123456789123456

![ref6](/assets/images/2026-07-15-AES-Reverse/ref6.png)
