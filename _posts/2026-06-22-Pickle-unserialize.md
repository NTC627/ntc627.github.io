---
layout: post
title: "[PrivEsc]Pickle反序列化提权学习笔记"
date: 2026-06-22
categories: [PrivEsc]
---
笔者对Pickle以及反序列化漏洞的相关知识有限，故仅以个人笔记的形式在此记录个人所学。详细的Pickle反序列化相关的知识请移步大佬博客 [Pickle反序列化](https://goodapple.top/archives/1069) ，本篇文章只进行简单的概念介绍和漏洞利用说明。

# Pickle

Pickle是Python的一个模块，用来对python的对象进行序列化和反序列化，不过这个模块并不安全，可以通过构造恶意的pickle数据，来使pickle执行对数据反序列化的同时，执行恶意代码。序列化和反序列化在pickle这里也叫封存和解封。

Python还存在一个更原生的序列化模块叫marshal，不过一般来说，pickle还是主要使用的序列化模块，marshal主要是为了支持Python的.pyc文件。

截止至文章成稿，当前共有6种协议可用于封存操作，使用的协议版本越高，读取所生成 pickle 对象所需的 Python 版本就要越新，以下内容来自python官网docs.python.org。

- v0 版协议是原始的“人类可读”协议，并且向后兼容早期版本的 Python。
- v1 版协议是较早的二进制格式，它也与早期版本的 Python 兼容。
- 第 2 版协议是在 Python 2.3 中引入的。 它为 [新式类](https://docs.python.org/zh-cn/3/glossary.html#term-new-style-class) 提供了更高效的封存机制。 请参考 [**PEP 307**](https://peps.python.org/pep-0307/) 了解第 2 版协议带来的改进的相关信息。
- v3 版协议是在 Python 3.0 中引入的。 它显式地支持 [`bytes`](https://docs.python.org/zh-cn/3/library/stdtypes.html#bytes "bytes") 字节对象，不能使用 Python 2.x 解封。这是 Python 3.0-3.7 的默认协议。
- v4 版协议添加于 Python 3.4。它支持存储非常大的对象，能存储更多种类的对象，还包括一些针对数据格式的优化。这是 Python 3.8--3.13中使用的默认协议。有关第 4 版协议带来改进的信息，请参阅 [**PEP 3154**](https://peps.python.org/pep-3154/)。
- 第 5 版协议是在 Python 3.8 中加入的。 它增加了对带外数据的支持，并可加速带内数据处理。 它是自 Python 3.14 起的默认协议。请参阅 [**PEP 574**](https://peps.python.org/pep-0574/) 了解第 5 版协议所带来的改进的详情。

# 序列化与反序列化

序列化与反序列化和一般的数据编码解码看起来很像，且其目的通常也都是为了更高效的传递数据，但其本质完全不同。编码解码作用的对象是数据（Data），序列化与反序列化作用的对象是面向对象语言中的对象（Object）。对象具有很多特点，对象也不止包含数据，不同的对象具有不同的方法，并且不同的对象有不同的对象引用，内存共享机制，生命周期，因此没法像编解码那样简单。

序列化其实更像是把对象转换成给编程语言的指令或者一种指导书，指导语言怎么根据这些指令或者指导书，重新构建出序列化之前的对象，比如对于pickle而言，它构造序列化的对象的时候，就会使用opcode（指令），其反序列化还原的对象则使用Pickle虚拟机，Pickle Virtual Machine（PVM）来执行opcode。其它语言，比如php，虽然不像pickle这样使用指令加虚拟机的模式，但是也会根据序列化的内容，来执行反序列化的恢复代码，因此对于这类反序列化的功能，我们通常可以通过构造恶意序列化数据，来使语言执行恶意代码。

# Pickle漏洞函数

Pickle的opcode与PVM的工作流程比较复杂，但是理解了以后，也能不通过构造恶意对象，再把恶意对象转换为opcode，进而打包成.pkl文件，而是直接手写序列化后的pickle opcode，直接构造恶意opcode使pvm执行。后者的灵活性会更高，能编写出pickle不能生成的opcode，因此也能用来绕过一些限制。不过还是过于复杂，因此这里不讨论。

我们直接从Pickle的反序列化函数开始讨论，这些函数会解析pickle序列化数据，是可以直接利用的，这样的函数有：

## 1.pickle.loads()

输入的参数是字节，或者字节数组，例如：

```python
obj = pickle.loads(data)
```

## 2.pickle.load()

输入是二进制文件，示例：

```python
with open('f.pkl', 'rb') as f:
	obj = pickle.load(f)
```

## 3.pickle.Unpickler

也是从文件中读取，这里顺便一提，官方的修复建议就是重写Unpickler.find\_class()方法，限制模块调用的函数，不过也可以用前面说的手写opcode来根据具体情况绕过。

```python
unpickler = pickle.Unpickler(f)
obj = unpickler.load()
```

## 4.\_pickle.loads()、\_pickle.load()、\_pickle.Unpickler

pickle模块底层用c语言重写，所以也可以直接调用底层的c模块，效果跟上面是一样的

## 5.其它会调用pickle反序列化的模块

这里列举部分。
### ( 1 ) shelve.open()

shelve是Python的一个数据1持久化的模块，它读取db的键值的时候会调用pickle反序列化。

```python
db = shelve.open('mydb')
val = db['key']
```

### ( 2 )  dill.loads()、dill.load()

dill是pickle的增强版，可以序列化更多东西，包括pickle无法序列化的lambda函数等。因此也比pickle更危险

```python
obj = dill.loads(data)
```

### ( 3 ) cloudpickle.loads()

cloudpickle常用于Ray，Dask等分布式框架。

```python
obj = cloudpickle.loads(data)
```

### ( 4 ) joblib.load()

机器学习领域常用的，用于加载外部模型。

```python
joblib.load('model.pkl')
```

# Pickle漏洞利用

这里依旧不讨论手写opcode的方式，只讨论常见payload的分析。以下是最简单的一个命令执行的pickle payload。

```python
import pickle
import os

class Evil:
    def __reduce__(self):
        return (os.system, ("id",))
```

payload中的\_\_reduce\_\_是一个利用中经常使用的方法，如果一个对象定义了\_\_reduce\_\_，那么pickle反序列化时就会优先根据\_\_reduce\_\_写的方法来重建，其要求返回一个元组，格式如下：

```python
(callable, args[, state[, listitems[, dictitems]]])
```

- **callable**：用于重建对象的可调用对象（通常是类本身，或者某个工厂函数）。
- **args**：传给 `callable` 的参数元组，像 `callable(*args)` 这样调用。
- **state**（可选）：对象的状态数据。反序列化时，会被传给 `__setstate__` 方法；如果没有定义 `__setstate__`，就直接更新到实例的 `__dict__` 中。
- **listitems**（可选）：一个可迭代对象，其中的元素会依次 `append` 到新对象上（要求新对象支持 `append`）。
- **dictitems**（可选）：一个可迭代对象，包含键值对，会通过 `obj[key] = value` 的方式更新到新对象上（要求新对象支持 `__setitem__`）。

由此，我们可以传递os库里的system函数给callable来执行任意命令。恶意类构造完后，可以通过pickle.dump()生成符合需求格式的paylaod。

在打靶机提权时，通常通过检查服务、计划任务、suid等，找到以root运行的会对pickle反序列化的脚本，然后构造恶意pickle去执行。
