---
layout: post
title: "[PWN]堆的Unsorted Bin Attack学习"
date: 2026-04-28
categories: [PWN]
excerpt: "简单介绍一下Unsorted Bin Attack的原理与两种利用方式"
---


# Unsorted Bin Attack

首先，和fastbin的结构不同，unsorted bin的结构是一个双向循环链表，FIFO。和fastbin的指定大小也不同，以下介绍其来源：

1.一个chunk被分割后，如果剩下的部分大于MINSIZE，就会归类到unsorted bin
2.一个chunk被释放后，如果大小不是fastbin chunk，而且也和top chunk不相邻，那么就会放到unsorted bin 
3.当chunk被合并时，如果不和top chunk相邻，那么可能会先把合并的chunk放到unsorted bin

基本的利用方式有两种：unsorted bin leak和unsorted bin attack

# Unsorted Bin Leak

由于是双向循环链表，也就意味着“尾”连着“首”，
``` bash
main_arena<->bin1<->bin2
   |	              |
   <------------------>
```

此处bin2的fd指针就指着main_arena的一部分（main_arena.bins\[0,1\]），如果可以泄漏其fd指针，就约等于可以得到main_arena地址，这个地址又是一个sturct_malloc_state类型的全局变量，可以结合libc算出libc的基址。注意思路别太死，这里虽然是泄漏bin2的fd指针，但如果只有一个bin的话，那么它的fd和bk都是指向main_arena的

算偏移又有两种方法，
1.通过\_\_malloc\_trim，因为该函数使用了main\_arena的地址，可以打开ida打开.so文件找到这个函数分析，IDA中引用该地址的方式类似这样：
R13 = &dword_3EBC40，因此找到这个就等于找到了偏移
2.通过\_\_malloc\_hook，main\_arena和\_\_malloc_hook有固定偏移，可以直接用工具查出，比如
``` python
pwntools
main_arena_offset = ELF("libc.so.6").symbols\["\_\_malloc\_hook"\] + 0x10
```

最后是利用部分：
``` c
unsorted bin attack:
          \/\* remove from unsorted list \*\/
          bck = victim->bk;
          if (\_\_glibc\_unlikely (bck->fd != victim))
            malloc_printerr ("malloc(): corrupted unsorted chunks 3");
          unsorted_chunks (av)->bk = bck;
          bck->fd = unsorted_chunks (av);
```
利用主要靠上述代码，这个代码是在取出unsorted bin的时候，先检查当前bin的前一个bin(bck)的fd指针指不指向当前的bin，然后unsorted_chunks(av)（这个变量表示的就是main_arena的作为unsorted bin的头节点的那一部分）的bk指针就会指向bck，bck的fd就会指向unsorted_chunks(av)（unlink的unsorted bin 版本），这里如果能控制当前bin的bk，那么bck的值就得到了控制，进而控制了main_arena的bk的值；而main_arena的bk指向的正是链表尾部的bin，根据FIFO原则，再次malloc一个大小合适的chunk时，就会取用该chunk，而最后的语句bck->fd = unsorted_chunk(av)，如果bck的构造是一个恶意地址，那就意味着我们能往这个地址写入内容unsorted_chunk(av)，不过可惜的是，这个值基本没法控制，只知道它很大，可以用来覆盖一些本来小的值去达到意想不到的效果。
