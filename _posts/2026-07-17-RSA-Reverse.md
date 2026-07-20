---
layout: post
title: "[Reverse]RSA加密算法逆向"
date: 2026-07-17
categories: [Reverse]
excerpt: "RSA是一个经典的非对称密钥算法。非对称密钥区别于对称密钥，加密和解密使用的密钥都不相同，加密使用的是公开的公钥，解密则使用由私人持有、不可公开的私钥。任何人都可以用密钥分发者的公钥来加密要发送的信息，但只有私钥所有者才能解密。本文将简单介绍RSA的原理，然后逆向分析其实现。"
---


# RSA过程

RSA的加解密涉及到数学的模运算，也有较多的数学公式，文章将只对一些核心的特征公式展开说明。

首先RSA的整个过程，可大致分为密钥生成、加密、解密三个步骤。其中加密和解密的步骤比较简单，最核心的计算来自密钥生成。

## 密钥生成

第一步，挑选两个大质数p和q。

第二步，计算模数n，`n=p*q`

第三步，计算欧拉函数，`φ(n)=(p−1)×(q−1)`

第四步，选择公钥指数e，满足`1<e<φ(n)`，现实一般直接取65537

第五步，计算私钥指数d，满足`(e×d)modφ(n)=1`

第六步，取`(n, e)`为公钥，`(n, d)`为私钥

## 加密与解密

M表示明文，C表示密文

加密：

![ref1](/assets/images/2026-07-17-RSA-Reverse/ref1.png)

解密：

![ref2](/assets/images/2026-07-17-RSA-Reverse/ref2.png)

RSA的安全性来自于大质数分解问题，现实中知道n，很难分解出两个质数p和q，然而随机计算能力的提升，现在如果n取值较小的话，完全可以被分解，而当下e基本都是固定取值，因此可以通过已知的p和q，像生成密钥一样求解私钥d。

# 逆向

C语言中，实现RSA中的大数字运算，需要使用到大数库GMP，下面来道题目看看。

一进来就没给我们好脸色，连main函数都找不到，但是熟悉C逆向的人就知道了，程序执行时，最开始运行的不是main函数，而是start函数，也就是我们下图看到的这个函数，而这个函数又会运行着`libc_start_main`，也就是sub_42BE70。而`libc_start_main`这个函数的第一个参数，就是main函数。

![ref3](/assets/images/2026-07-17-RSA-Reverse/ref3.png)

进去main函数以后也是一个符号没有，不过总体分析比较简单，而分析过程又比较麻烦，先附上一张逆向前的图片：

![ref4](/assets/images/2026-07-17-RSA-Reverse/ref4.png)

然后是逆向后的：

![ref5](/assets/images/2026-07-17-RSA-Reverse/ref5.png)

接下来是每个函数的逆向思路，把逆向前和逆向后的函数一一对应：

### sub_43A8D0->scanf

不要被逆向前的一串参数震慑住了，要抓重点，看到"%99s"，这个东西表明这个函数是按format去处理字符串的，即函数为某种格式化字符串相关的函数，同时结合程序的运行可以判断，这个函数会接收输入，那么基本就是scanf，当然c里面格式化字符串输入函数还有很多，但这里不需要纠结到底是哪一个。

## sub_401CA5->TEA_encrypt

看图就知道为什么是TEA了，核心操作就是循环内先用DELTA加一个sum值，然后进行feistel轮操作，feistel轮的特点就是两行又有移位，又有异或等操作的代码，并且两行代码的变量相互交织，上面的运算会使用到下面运算的变量，下面的运算同理。

![ref6](/assets/images/2026-07-17-RSA-Reverse/ref6.png)

## sub_401F50->mpz_cmp

结合流程来看，此处使用了一个判断函数来判断两个值是否相等，相等则输出"Yes!"，那么这应该是一个cmp比较函数，结合后面分析出gmp库，应该是对两个大数进行比较（题目给的密文和我们输入的密文），所以应该是mpz_cmp。

## sub_443920->puts

You Know Why

## j_ifunc_45840->strlen

CTF里，一般会先判断输入长度才会进行其它运算，这里符合特征，同时从后面的gmp、TEA来看，输入应该满足16字节，所以这里应该是个判断长度的函数。

## sub_401FD0->mpz_import

能判断出gmp库是一个巨大的进步，这里判断出gmp依据的一个重要特征就是mpz_import，这个函数的参数很长，这是函数原型

```c
void mpz_import (mpz_t rop, size_t count, int order, int size, int endian, size_t nails, const void *op);
```

rop，表示目标大整数变量，op表示原始数据

count，size表示数据规模，count表示数据块的数量，size表示每个数据块的字节数，通常设为1；

order，表示数据块之间的顺序，endian表示数据块内部的排序，1是大端-1是小端。

nails，表示每个数据块中被忽略的最高有效位数量，一般取0。

因此，一般的用gmp导入是这样的：

```c
mpz_import(T, 16, 1, 1, 0, 0, S);
```

这个1100算是比较明显的一个特征，而且七个参数的函数也不常见。

此外，还有一个决定性的特征，IDA里shift+f12打开字符串窗口。

![ref7](/assets/images/2026-07-17-RSA-Reverse/ref7.png)


## 其它GMP函数

判断出gmp以后，其它就简单了，可以直接去查gmp函数原型，就可以知道剩下的GMP函数是什么了，所有符号逆向出来以后，分析一下程序的基本流程。

## 基本流程与题解

就以逆向后的来说吧，变量名是主要是依据输入、输出判断出来谁是明文，谁是密文，再由mpz_powm函数的计算以及mpz_set_ui的初始化，判断出谁是e谁是n这些RSA的基本常量。

![ref8](/assets/images/2026-07-17-RSA-Reverse/ref8.png)

基本的反混淆结束后，就该看看流程了，首先先接受输入，然后判断输入长度，符合16字节就交给TEA加密，（这里的TEA加密从前面也可以看到，虽然feistel结构没变，但是在数字的处理上，有细微的区别，因此之后逆向不能直接用标准库），之后由gmp来初始化、赋值大数变量，（这里521如果换成65537的话，能更快发现是RSA），之后用mpz_powm计算了`C=M^e mod n`，这里计算后的值直接覆盖原本的明文，最后比较加密后的明文与程序中的密文是否一致。

题目没有直接给d，因此想解题的话，需要先手动分解n，这里的n只有16字节，算比较短的，可以使用python的sympy的factorint来分解，可以得出p和q分别为

```python
p = 1212112637077862917192191913841
q = 1201147059438530786835365194567
```

由此，就可以计算出私钥，然后对题目的密文解密了，解密出来的还是经过TEA加密的，因此也要把TEA内部的逻辑逆向成解密逻辑，TEA的解密逻辑只要把加密逻辑中的顺序对调一下就行，难点其实可能在于用python重新把IDA中的C表达式重新写一遍，以及里面的v1、v2这些变量名也要重新命名，可能会乱。TEA的key是直接以数组的形式在程序中保存的。

最后是脚本与flag：

```python
from sympy import factorint
from Crypto.Util.number import inverse, long_to_bytes

N = int("e7f13bc8657279d513c9e7b13fab4244f73a667e9c85d56357", 16)
C = int("e66d28e21bcdc0c20f82d8985187b51e3e5e3a0772a588ac49", 16)
E = 521
KEY = [2, 0, 2, 3]
DELTA = 0xDEADBEEF
ROUNDS = 17

def xtea_decrypt_block(block, key):
	v0 = int.from_bytes(block[:4], "little")
	v1 = int.from_bytes(block[4:], "little")
	s = (ROUNDS * DELTA) & 0xffffffff

	for _ in range(ROUNDS):
		v1 = (v1 - ((((v0 >> 5) ^ (v0 << 4)) + v0) ^ ((key[(s >> 11) & 3] + s) & 0xffffffff))) & 0xffffffff
		v0 = (v0 - ((((v1 >> 5) ^ (v1 << 4)) + v1) ^ ((key[s & 3] + s) & 0xffffffff))) & 0xffffffff
		s = (s - DELTA) & 0xffffffff

	return (v0.to_bytes(4, "little") + v1.to_bytes(4, "little"))

print("[*] factoring...")
fac = factorint(N)
print(fac)
p, q = fac.keys()
phi = (p - 1) * (q - 1)
d = inverse(E, phi)
print("[*] d =", d)
M = pow(C, d, N)
buf = long_to_bytes(M)
buf = buf.rjust(16, b"\x00")
print("[*] encrypted =", buf.hex())
left = xtea_decrypt_block(buf[:8], KEY)
right = xtea_decrypt_block(buf[8:], KEY)
flag = left + right
print(flag)
```

```bash
$ python solve.py
[*] factoring...
{1212112637077862917192191913841: 1, 1201147059438530786835365194567: 1}
[*] d = 611991729389298320721781248684054085054264947763245697302041
[*] encrypted = 75cf446349046ffc5aeb4d858b899244
b'flag{good_job!!}'
```










