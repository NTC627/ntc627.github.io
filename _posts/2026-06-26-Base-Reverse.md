---
layout: post
title: "[Reverse]Base系列编码算法逆向"
date: 2026-06-26
categories: [Reverse]
---
Base系列编码，采用有限可打印的的ASCII字符集作为编码表，将数据按固定长度比特映射为对应字符。不同的Base编码的核心区别在于编码表长度。

# 常见成员

1.Base16：也等同于hex编码，4比特一组，字符集为0-9A-F。

2.Base32：5比特一组，字符集A-Z2-7

3.Base64：6比特一组，字符集A-Za-z0-9+/

# Base64原理

这里主要以Base64编码的逆向进行讲解，首先先看base64编码的计算，一般可以分为刚好每个字符完全编码，和需要填充两种情况，见下图，这是刚刚好完全编码的情况，每个字符转换成8位二进制，然后以每6个比特为一组去编码表找对应的编码即可。

![ref1](/assets/images/2026-06-26-Base-Reverse/ref1.png)

这是需要填充的情况，由于8比特编码为6比特的数字关系，需要填充的只会分为两种情况，一种是需要补4个0，然后以等于号的形式再补充剩下的值，一种是补两个0，然后以等号的形式补充剩下的值，在解码的时候，根据等号的数量，就能知道要丢弃多少的补0比特。也就是说base64的填充只有三种情况，不进行填充，填充4比特0，填充2比特0。

![ref2](/assets/images/2026-06-26-Base-Reverse/ref2.png)

# Base64逆向特征

base64在IDA里的特征还是很明显的，一个特征是6-8按位映射，另一个特征是编码表。这里随便找一题，以下是其main函数

![ref3](/assets/images/2026-06-26-Base-Reverse/ref3.png)

整个逻辑非常简单，利用某个输入函数把我们的输入传入Str变量，然后用sub_4110be函数对我们输入做了某种处理，并且这个处理之前还需要计算Str的长度，总之得到v4，v4又复制给Destination，然后遍历Destination每一位的同时做加法，最后与Str2做比较判断flag是否正确。

点开sub_4110be，找到真正处理逻辑的sub_411ab0，这里的处理就很明显了，可以看出三个base64的特征，首先是三个case，对应base64的三种填充情况。

![ref4](/assets/images/2026-06-26-Base-Reverse/ref4.png)

其二是编码表，这个aAbcdefg...的变量，是IDA直接用字符串的内容命名的变量名，可以点开在数据段中查看，发现其字符集和base64完全符合。

![ref5](/assets/images/2026-06-26-Base-Reverse/ref5.png)

其三是决定性的特征，8变6查表，`algn_41A145[0] & 0xF0) >> 4`取低4位，`(16 * (byte_41A144[0] & 3))`取高2位，之后用异或把两部分拼起来一共六位拿去查表得值，因此这就是base64。

```c
aAbcdefghijklmn[((algn_41A145[0] & 0xF0) >> 4) | (16 * (byte_41A144[0] & 3))];
```

知道算法是base64以后，只要确认了编码表，我们就可以直接用其他工具、脚本等去解码flag了。ctf中会出现base64变种编码，即改变默认的编码表，这时候就需要手动做一些映射，网上的一些工具比如cyberchief也支持自定义编码表，也可以直接使用。

```python
import base64

old = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
new = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+/"
mapper = str.maketrans(new, old)
```

知道了base64的逆向，其它的base系列也是差不多的，关键在于识别出算法，然后找到编码表。
