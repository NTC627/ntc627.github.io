---
layout: post
title: "[Reverse]IDAPython常用函数简介"
date: 2026-06-25
categories: [Reverse]
---
IDAPython允许用户创建自定义脚本和插件，以增强IDA核心功能，官方文档位置：https://python.docs.hex-rays.com/。本文将对常用函数进行说明。ea指的是有效地址，effective address。

# 一、基础API

## 1.here() / get_screen_ea

返回光标所在位置的地址

![ref1](/assets/images/2026-06-25-IDAPython/ref1.png)

## 2.get_inf_attr(INF_MIN_EA) / get_inf_attr(INF_MAX_EA)

获取最小有效地址或最大有效地址，比如linux上的不开随机化的程序，get_inf_attr(INF_MIN_EA)就是0x8048000

```python
Python>get_inf_attr(INF_MIN_EA)
0x8048000
Python>get_inf_attr(INF_MAX_EA)
0x804a038
```

## 3.generate_disasm_line(ea, GENDSM_FORCE_CODE)

获取ea处的一条汇编指令，GENDSM_FORCE_CODE表示强制将地址当作指令反汇编

```python
Python>generate_disasm_line(0x8048533, GENDSM_FORCE_CODE)
'jnz     short loc_8048518'
```

## 4.print_insn_mnem(ea)

获取ea所在处的指令助记符，指令助记符就是mov这些

```python
Python>print_insn_mnem(0x8048518)
'sub'
```

## 5.print_operand(ea, n)

获取ea所在处的第n个操作数

```python
Python>print_operand(0x804852E, 0)
'esp'
Python>print_operand(0x804852E, 1)
'10h'
```

# 二、段

## 1.Segments()

返回段的迭代器，可以用遍历来看看有什么段

```python
for seg in Segments():
    print(f"{get_segm_name(seg)}, {get_segm_start(seg)}, {get_segm_end(seg)}")
```

```python
Python>Segments()
<generator object Segments at 0x7f1849518ee0>
Python>for seg in Segments():
Python>  print(f"{get_segm_name(seg)}, {get_segm_start(seg)}, {get_segm_end(seg)}")
Python>
LOAD, 134512640, 134513392
.init, 134513392, 134513427
LOAD, 134513427, 134513440
.plt, 134513440, 134513504
.plt.got, 134513504, 134513512
LOAD, 134513512, 134513520
.text, 134513520, 134513986
LOAD, 134513986, 134513988
.fini, 134513988, 134514008
.rodata, 134514008, 134514038
LOAD, 134514038, 134514040
.eh_frame_hdr, 134514040, 134514084
.eh_frame, 134514084, 134514288
.init_array, 134520584, 134520588
.fini_array, 134520588, 134520592
.jcr, 134520592, 134520596
LOAD, 134520596, 134520828
.got, 134520828, 134520832
.got.plt, 134520832, 134520856
.data, 134520856, 134520864
.bss, 134520864, 134520868
.prgend, 134520868, 134520869
extern, 134520872, 134520888
```

## 2.get_segm_name(ea)

获取ea所在段名

```python
Python>get_segm_name(0x0804853B)
'.text'
```

## 3.get_next_seg(ea)

获取ea的下一个段的起始地址

```python
Python>get_next_seg(0x0804853B)
0x8048542
```

## 4.get_segm_start(ea) / get_segm_end(ea)

获取ea所在的段开始地址、段结束地址

```python
Python>get_segm_start(0x0804853B)
0x8048370
Python>get_segm_end(0x0804853B)
0x8048542Python>get_segm_start(0x0804853B)
0x8048370
Python>get_segm_end(0x0804853B)
0x8048542
```

# 三、函数

## 1.Functions()

和Segments()相似，获取返回函数的迭代器，可以通过Functions(start_addr, end_addr)来指定截取的函数。

## 2.get_func_name(ea)

返回函数名称

```python
Python>get_func_name(here())
'main'
```

## 3.idaapi.get_func(ea)

获得解析后的函数对象，包含函数完整信息，比如起始地址、栈帧等

```python
Python>idaapi.get_func(here())
<ida_funcs.func_t; proxy of <Swig Object of type 'func_t *' at 0x7f18499eedc0> >
```

可以用dir来列出函数对象的所有属性和方法名

```python
dir(idaapi.get_func(here()))
['__annotations__', '__class__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__firstlineno__', '__format__', '__ge__', '__get_points__', '__get_referers__', '__get_regargs__', '__get_regvars__', '__get_tails__', '__getattribute__', '__getstate__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__iter__', '__le__', '__lt__', '__module__', '__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__static_attributes__', '__str__', '__subclasshook__', '__swig_destroy__', '__weakref__', '_print', 'addresses', 'analyzed_sp', 'argsize', 'clear', 'code_items', 'color', 'compare', 'contains', 'data_items', 'does_return', 'empty', 'end_ea', 'extend', 'flags', 'fpd', 'frame', 'frame_object', 'frregs', 'frsize', 'get_frame_object', 'get_name', 'get_prototype', 'head_items', 'intersect', 'is_far', 'name', 'need_prolog_analysis', 'not_tails', 'overlaps', 'owner', 'pntqty', 'points', 'prototype', 'referers', 'refqty', 'regargqty', 'regargs', 'regvarqty', 'regvars', 'size', 'start_ea', 'tailqty', 'tails', 'this', 'thisown']
```

## 4.get_func_attr(ea, FUNCATTR_START) / get_func_attr(ea, FUNCATTR_END)

获取函数边界，比如起始地址与结束地址。

```python
Python>get_func_attr(here(), FUNCATTR_START)
0x804846b
Python>get_func_attr(here(), FUNCATTR_END)
0x80484de
```

可以用来打印一个函数的相关东西，比如打印一个函数的反汇编

```python
ea = here()
start = get_func_attr(ea, FUNCATTR_START)
end = get_func_attr(ea, FUNCATTR_END)

while start < end:
	print(f"0x{start} {generate_disasm_line(start, 0)}")
	start = next_head(start)
```

打开IDA里的File->Execute script即可执行脚本

![ref2](/assets/images/2026-06-25-IDAPython/ref2.png)
## 5.get_next_func(ea) / get_prev_func(ea)

获取下、上一个函数

```python
Python>get_next_func(here())
0x80484e0
Python>get_prev_func(here())
0x8048440
```

## 6.next_head(ea) / prev_head(ea)

获取下、上一条指令的地址

```python
Python>next_head(here())
0x8048475
Python>prev_head(here())
0x804846f
```

## 7.FuncItems(ea)

返回函数内指令的迭代器，可以用于获取ea所在函数的所有指令的地址

```python
Python>FuncItems(here())
<ida_funcs.func_item_iterator_t; proxy of <Swig Object of type 'func_item_iterator_t *' at 0x7f184a1ff780> >
```

比如用来打印函数所有指令反汇编

```python
for ea in FuncItems(here()):
    print(f"0x{hex(ea)} {generate_disasm_line(ea, 0)}")
```

或者找到函数中所有的跳转指令

```python
for ea in FuncItems(here()):
    asm = generate_disasm_line(ea, 0)
    if "jmp" in asm:
        print(f"0x{hex(ea)} {generate_disasm_line(ea, 0)}")
```

# 四、指令

## 1.idaapi.decode_insn(out, ea)

解析指令，获取指令的助记符、操作数等，然后填充到一个insn_t结构体out
## 2.ida_ua.insn_t()

new一个insn_t结构体，结合idaapi.decode_insn(out, ea)，可以找到函数中所有跳转指令，如下：

```python
JMPS = [idaapi.NN_jmp, idaapi.NN_jmpfi, idaapi.NN_jmpni]

for ea in FuncItems(here()):
    ins = ida_ua.insn_t()
    idaapi.decode_insn(ins, ea)
    if ins.itype in JMPS:
        print(f"0x{hex(ea)} {generate_disasm_line(ea, 0)}")
```

# 五、操作数

可以用get_operand_type(ea, n)得到操作数的类型，用get_operand_value(ea, n)得到操作数的值，其中n表示操作数的索引。

```python
0x0804846F  and     esp, 0FFFFFFF0h
Python>get_operand_type(0x0804846F, 0)
0x1
Python>get_operand_type(0x0804846F, 1)
0x5
Python>get_operand_value(0x0804846F, 0)
0x4
Python>get_operand_value(0x0804846F, 1)
0xfffffffffffffff0
```

类型比较多，所以先讲值，对于立即数来说，get_operand_value(ea, n)就是直接取立即数的值，而对于寄存器来说，get_operand_value(ea, n)会取寄存器的内部编号，比如esp就是0x4。不过如果是`[reg + 0x8]`这样的形式的话，IDA就只能静态分析推断出它的值或者直接无法推断。

接下来重点讲讲类型。不同ida版本等所有的操作数类型数量不同，比如`o_idpspec0`、`o_idpspec1`这种不是固定有的类型，但是有8种是固定的

```python
类型值  类型名
0      o_void   表示指令没有任何操作数
1      o_reg    表示操作数是普通寄存器
2      o_mem    表示操作数是直接内存引用
3      o_phrase 表示寄存器与索引寄存器组合，比如[rsi + rax]
4      o_displ  表示寄存器加立即数，比如[rdi + 18h]
5      o_imm    表示操作数是立即数
6      o_far    表示操作数是立即数远地址，比如short_loc_4005c8
7      o_near   表示操作数是立即数近地址
```

# 六、数据

获取数据与写数据，看名字就知道干什么的，没什么好说的，比如获取bytes类型的数据什么的，有这些指令

```python
get_bytes(ea, size)
ida_bytes.get_byte(ea)
ida_bytes.get_word(ea)
ida_bytes.get_dword(ea)
ida_bytes.get_qword(ea)
ida_bytes.patch_bytes(ea, buf)
ida_bytes.patch_byte(ea, val)
ida_bytes.patch_word(ea, val)
ida_bytes.patch_dword(ea, val)
ida_bytes.patch_qword(ea, val)
```

# 七、调试

调试相关的，这些和在ida里手动操作的效果是一样，也没什么好说的

## 1.add_btp(ea) 

在ea处添加断点

## 2.del_btp(ea)

删除断点

## 3.start_process(path, args, sdir)

启动调试，path是被调试的文件的目录，sdir是调试器的工作目录

## 4.step_into() / step_over()

步入和步过

## 5.step_until_ret()

执行到返回

## 6.get_reg_value(regname)

获取寄存器值

## 7.set_reg_value(value, regname)

设置寄存器值

## 8.wait_for_next_event(wfne, timeout)

等待并捕获下一个调试事件（如断点、异常、进程结束等）。wfne表示等待的事件，取值可以有：
- `WFNE_SUSP` – 等待进程暂停（断点、单步等）。
- `WFNE_CONT` – 等待进程继续运行（一般不用）。
- `WFNE_ANY` – 等待任何事件。
- `WFNE_SUSP | WFNE_NOWAIT` – 检查但不挂起，立即返回是否有事件。
timeout可以设置超时，取-1可以无限等待。注意这里说的等待是让脚本等待程序执行，而不是控制程序的暂停，一般是用来暂停脚本，直到程序运行到了断点的时候，再配合get_reg_value等去分析程序当前的各个值。
