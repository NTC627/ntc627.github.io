---
layout: post
title: "[Reverse]TEA系列加密算法逆向"
date: 2026-07-13
categories: [Reverse]
excerpt: "TEA，Tiny Encryption Algorithm，也被称作茶，属于分组加密算法。TEA被设计为一个轻量的加密算法，具有代码量少、运行速度快、占用内存少的特点。基于TEA，又有XTEA、XXTEA两种针对加密效果等问题提出的改进算法，本文将对这些算法做逆向分析。"
---


# TEA

TEA以64位明文为一个分组，使用128位的密钥，采用feistel结构进行迭代，迭代最少32轮，推荐64轮。TEA系列算法中还使用了DELTA常数，这个常数不影响算法，用来使每一轮的轮密钥都不同，推荐取值为黄金分割比（0.618）和 `2^32` 的乘积，也就是取0x9e3779b9，也算是这个算法比较固定的取值了，不过IDA反编译的时候经常会出现数字的形式改变，比如以十进制显示，或者无符号判断为有符号，因此也要注意一下这个数字的其它表示。

32轮的算法实现，的确非常短

```c
#include <stdio.h>
#include <stdint.h>

void encrypt (uint32_t* v, uint32_t* k) {
    uint32_t sum = 0;  // 注意sum也是32位无符号整型
    uint32_t v0 = v[0], v1 = v[1];
    uint32_t delta = 0x9e3779b9;
    uint32_t k0 = k[0], k1 = k[1], k2 = k[2], k3 = k[3];

    for (int i=0; i<32; i++) {
        sum += delta;
        v0 += ((v1<<4) + k0) ^ (v1 + sum) ^ ((v1>>5) + k1);
        v1 += ((v0<<4) + k2) ^ (v0 + sum) ^ ((v0>>5) + k3);
    }

    v[0]=v0; 
    v[1]=v1;
}

void decrypt (uint32_t* v, uint32_t* k) {
    uint32_t v0 = v[0], v1 = v[1];
    uint32_t delta = 0x9e3779b9;
    uint32_t sum = delta * 32;
    uint32_t k0 = k[0], k1 = k[1], k2 = k[2], k3 = k[3];

    for (int i=0; i<32; i++) {
        v1 -= ((v0<<4) + k2) ^ (v0 + sum) ^ ((v0>>5) + k3);
        v0 -= ((v1<<4) + k0) ^ (v1 + sum) ^ ((v1>>5) + k1);
        sum -= delta;
    }

    v[0]=v0; 
    v[1]=v1;
}

// test
int main()
{
    // 两个32位无符号整数，即待加密的64bit明文数据
    uint32_t v[2] = {0x12345678, 0x78563412};
    // 四个32位无符号整数，即128bit的key
    uint32_t k[4]= {0x1, 0x2, 0x3, 0x4};

    printf("Data is : %x %x\n", v[0], v[1]);
    encrypt(v, k);
    printf("Encrypted data is : %x %x\n", v[0], v[1]);
    decrypt(v, k);
    printf("Decrypted data is : %x %x\n", v[0], v[1]);

    return 0;
}
```

# XTEA

XTEA的密钥长度、分组大小都没有变化，还是64位分组、128位密钥长度，改变主要是在对于轮函数的内部计算，直接上代码吧

```c
#include <stdio.h>
#include <stdint.h>

void encrypt(uint32_t* v, uint32_t* key) {
    uint32_t v0 = v[0], v1 = v[1];
    uint32_t sum = 0, delta = 0x9E3779B9;

    for (int i=0; i<32; i++) {
        v0 += (((v1 << 4) ^ (v1 >> 5)) + v1) ^ (sum + key[sum & 3]);
        sum += delta;
        v1 += (((v0 << 4) ^ (v0 >> 5)) + v0) ^ (sum + key[(sum>>11) & 3]);
    }

    v[0]=v0;
    v[1]=v1;
}

void decrypt(uint32_t* v, uint32_t* key) {
    uint32_t v0 = v[0], v1 = v[1];
    uint32_t delta = 0x9E3779B9;
    uint32_t sum = delta * 32;

    for (int i=0; i<32; i++) {
        v1 -= (((v0 << 4) ^ (v0 >> 5)) + v0) ^ (sum + key[(sum>>11) & 3]);
        sum -= delta;
        v0 -= (((v1 << 4) ^ (v1 >> 5)) + v1) ^ (sum + key[sum & 3]);
    }

    v[0]=v0;
    v[1]=v1;
}

// test
int main()
{
    // 两个32位无符号整数，即待加密的64bit明文数据
    uint32_t v[2] = {0x12345678, 0x78563412};
    // 四个32位无符号整数，即128bit的key
    uint32_t k[4]= {0x1, 0x2, 0x3, 0x4};

    printf("Data is : %x %x\n", v[0], v[1]);
    encrypt(v, k);
    printf("Encrypted data is : %x %x\n", v[0], v[1]);
    decrypt(v, k);
    printf("Decrypted data is : %x %x\n", v[0], v[1]);

    return 0;
}
```

# XXTEA

XXTEA的改变就很大了，明文分组最小可以取64位，再大的，只要满足是32整数倍的长度即可，加密轮数也不再固定，会根据分组长度来变化，公式为`6 + 52 / (分组长度/32)`，比如64位分组的话，轮数就还是32。此外轮函数的实现也改变了：

```c
#include <stdio.h>
#include <stdint.h>


#define DELTA 0x9e3779b9
#define MX (((z>>5^y<<2) + (y>>3^z<<4)) ^ ((sum^y) + (key[(p&3)^e] ^ z)))


void xxtea(uint32_t* v, int n, uint32_t* key)
{
    uint32_t y, z, sum;
    unsigned p, rounds, e;

    if (n > 1)             // encrypt
    {
        rounds = 6 + 52/n;
        sum = 0;
        z = v[n-1];
        do
        {
            sum += DELTA;
            e = (sum >> 2) & 3;
            for (p=0; p<n-1; p++)
            {
                y = v[p+1];
                z = v[p] += MX;
            }
            y = v[0];
            z = v[n-1] += MX;
        }
        while (--rounds);
    }
    else if (n < -1)      // decrypt
    {
        n = -n;
        rounds = 6 + 52/n;
        sum = rounds * DELTA;
        y = v[0];
        do
        {
            e = (sum >> 2) & 3;
            for (p=n-1; p>0; p--)
            {
                z = v[p-1];
                y = v[p] -= MX;
            }
            z = v[n-1];
            y = v[0] -= MX;
            sum -= DELTA;
        }
        while (--rounds);
    }
}

// test
int main()
{
    // 两个32位无符号整数，即待加密的64bit明文数据
    uint32_t v[2] = {0x12345678, 0x78563412};
    // 四个32位无符号整数，即128bit的key
    uint32_t k[4]= {0x1, 0x2, 0x3, 0x4};
    //n的绝对值表示v的长度，取正表示加密，取负表示解密
    int n = 2;

    printf("Data is : %x %x\n", v[0], v[1]);
    xxtea(v, n, k);
    printf("Encrypted data is : %x %x\n", v[0], v[1]);
    xxtea(v, -n, k);
    printf("Decrypted data is : %x %x\n", v[0], v[1]);

    return 0;
}
```

# 逆向分析

TEA、XTEA、XXTEA的逆向都来看看吧，先是TEA的，主函数没什么东西，

![ref1](/assets/images/2026-07-13-TEA-Reverse/ref1.png)

可以把函数一个个点开看看，然后发现sub_1400010B4有东西，

![ref2](/assets/images/2026-07-13-TEA-Reverse/ref2.png)

反汇编继承了TEA的简单，看着很舒服，这个v3明显是DELTA，result就是sum，虽然这里的DELTA不是标准值，但用DELTA迭代sum的特征保留了。v8是跌倒次数，这里是32，也和TEA相符合，Feistel结构也保留下来了，对两个变量分别处理并轮换：

```c
v7 += (v3 + v9) ^ (v2 + 16 * v9) ^ (v4 + (v9 >> 5));
v9 += result ^ (v5 + 16 * v7) ^ (v6 + (v7 >>k5));
```

其本质是在做加法，因此解密算法逆过来做减法就行。对了，主函数里之所以会多次调用sub_1400010B4，是因为TEA是分组加密算法，调用一次只会对一个分组加密，所以要多次调用。

```c
v9 -= (v3 + v7) ^ (v5 + 16 * v7) ^ (v6 + (v7 >> 5));
v7 -= (v3 + v9) ^ (v2 + 16 * v9) ^ (v4 + (v9 >> 5));
```

接下来看看XTEA的，这里的v4看起来不是标准的DELTA，但其值为负数，`-0x61c88647=0x9e3779b9`，实际上就是标准DELTA

![ref3](/assets/images/2026-07-13-TEA-Reverse/ref3.png)

其核心部分轮函数：

```c
v6 += (((v5 >> 5) ^ (16 * v5)) + v5) ^ (*(_DWORD *)(4LL * (v4 & 3) + a2) + v4);  v5 += (((v6 >> 5) ^ (16 * v6)) + v6) ^ (*(_DWORD *)(4LL * ((v4 >> 11) & 3) + a2) + v4);
```

也是可以直接写成解密形式，对调一下顺序即可

```c
v5 -= (((v6 >> 5) ^ (16 * v6)) + v6) ^ (*(_DWORD *)(4LL * ((v4 >> 11) & 3) + a2) + v4);
v6 -= (((v5 >> 5) ^ (16 * v5)) + v5) ^ (*(_DWORD *)(4LL * (v4 & 3) + a2) + v4);
```

`v4 += 0x61C88647;`v4也记得加回去，XTEA其他的相比TEA变化不大，所以不说了。最后是XXTEA的，

![ref4](/assets/images/2026-07-13-TEA-Reverse/ref4.png)

可以看到最外层while的条件，有个52，别看它这个式子计算的值挺大，把-1640531527也就是0x9E3779B9提出来，其实就是`DELTA * (52/n + 6)` 。由此判断出是XXTEA算法后，就慢慢分析它的轮函数然后写出对应解密就行了，XXTEA涉及到的状态变量更多，没法直接像前面一样直接交换一下就ok，这里就略了。