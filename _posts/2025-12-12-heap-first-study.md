---
layout: post
title: "[PWN]初次学习堆--认识堆的基本结构"
date: 2025-12-12
categories: [PWN]
excerpt: "学习堆的pwn，就要从堆的基本结构开始学起，对于初学者而言，堆的基本结构内容很多，本人不推荐一次性把所有结构都了解清楚了，才进一步学习，而是先对总体有个大概的认知，再去细化每个具体的结构，从而加深对总体的理解。"
---


# 堆的基本结构
## 1.堆基本概念
堆的结构是由不同应用程序决定，与数据结构中的堆不同，程序中的堆一般指代一块连续的内存，且由于不同应用程序对内存的需求不同，有些要求的内存比较小块，有些应用要求的内容又比较大块。在glibc中，使用的堆分配器是Ptmalloc。

## 2.arena、bin、chunk
一个程序可以有多个`arena`（多线程），`arena`是个管理堆内存的东西。bin是一个“存放”空闲堆块的数据结构。`chunk`是堆管理的基本单位。
```
-arena
	|-bin
	|-chunk
```
## 3.几种bin
`fastbin`
`smallbin`
`largebin`
`unsortedbin`

## 4.几种chunk
`fastbin` `chunk`
unsorted bin `chunk`
`smallbin` `chunk`
`top chunk`
`mmapped` `chunk`

## 5.chunk
接下来先讲讲`chunk`吧，一个`chunk`，除了用户malloc时给用户分配的区域`userdata`，还有十分重要的头数据，接下来讲讲几个重要的字段。
（1）`prev_size`，如果前一个相邻`chunk`空闲，则该字段记录的是其大小，否则记录前一个`chunk`的数据
（2）size，当前`chunk`的大小，会自动对齐到MALLOC_ALIGNMENT的整数倍
（3）fd，bk，当前`chunk`使用时，从fd字段起是用户数据。空闲时，fd指向下一个空闲`chunk`，bk指向上一个`chunk`。

## 6.bin类型
在讲`chunk`的分类之前需要讲bin，`chunk`的一部分分类其实是按它释放以后所归属的bin来分类的，一般来说每个`chunk` free后，其指针都会链接到bin相关的链表中管理。
（1）`fastbin`，这类bin具有固定大小（取决于版本和设置）且一般不大，用于快速分配，使用单链表来管理。
（2）`smallbin`，也是管理小空间的`chunk`，但范围比`fastbin`要大一些，使用双向循环链表。
（3）`largebin`，比`smallbin`的空间要大，其它差不多。
（4）unsorted bin，虽然有大小bin之分，但是最开始free时，都归于unsorted bin，在malloc时才会再划分成`largebin`或者`smallbin`，然后再划分`chunk`。

## 7.chunk类型
`chunk`有好几种类型，在4中已经说过了，现在讲讲这几种类型是怎么分的。
（1）`fastbin` `chunk`，如果`chunk`的范围在特定的小范围内，比如0x20到0x80，这类`chunk`就被划分为`fastbin` `chunk`。
（2）unsorted bin `chunk`，free的时候，一个`chunk`如果不是特殊情况就会变成unsorted bin `chunk`。
（3）`largebin` `chunk`和`smallbin` `chunk`，这两个`chunk`都是从unsorted bin `chunk`划分来的，当调用malloc时，可以根据申请的大小从unsorted bin `chunk`中取出来，并划分为`largebin` `chunk`和`smallbin` `chunk`。
（4）`top chunk`，一开始malloc的时候，自动从系统中申请一块比我们malloc中填写的数值要大的部分，然后其中一部分分给用户使用，剩下的大块空闲就是`top chunk`，这样的机制是防止malloc反复申请，反复触发系统调用。`top chunk`在高地址。
（5）`mmapped` `chunk`，独立于之前的`arena`，这是比上方说的各种`chunk`的空间都要大的多的`chunk`，由单独特定的管理来分配和释放。

## 8.malloc、calloc、free
malloc会初始化`chunk`并分配，和calloc不同，malloc申请地址的时候不会把里面的内存都清空，就是原来的东西都还在。
free操作会释放已经分配的`chunk`，但不会清空其内容，free时会判断`chunk`类型同时按分类把它挂到不同bin或在其他上（`munmap`）。free时还会合并前后空闲`chunk`，如果与`top chunk`相邻就合并进`top chunk`。

## 小结
第一次接触堆，概念可能描述的不是很准确，后续一步步学了一步步补充吧。

## 二次编辑
了解完每一种攻击后再回头看，这篇笔记确实写的挺皮毛的，后面的笔记对各种bin的结构做了详细分析了，这里不补充了，不过学完以后，我自己感觉下面的这张图非常重要，所有的攻击方法无非是利用这几个指针实现读写，非常建议牢牢记住这个结构体

![ref1](/assets/images/2025-12-12-heap-first-study/ref1.webp)
