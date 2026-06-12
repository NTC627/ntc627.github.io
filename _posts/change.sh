#!/bin/bash

# 检查是否提供了目录参数
if [ -z "$1" ]; then
    echo "用法: $0 <目标文件夹路径>"
    echo "示例: $0 ./my_posts"
    exit 1
fi

TARGET_DIR="$1"

# 检查目录是否存在
if [ ! -d "$TARGET_DIR" ]; then
    echo "错误: 目录 '$TARGET_DIR' 不存在！"
    exit 1
fi

echo "开始处理目录: $TARGET_DIR"
echo "--------------------------------------------------"

# 查找目录下所有的 .md 文件
find "$TARGET_DIR" -type f -name "*.md" | while read -r file; do
    echo "正在处理: $file"
    
    # 使用 awk 处理文件内容
    awk '
    BEGIN { 
        in_header = 0
        category = ""
        has_categories = 0 
    }
    /^---/ {
        if (in_header == 0) {
            in_header = 1
            print
            next
        } else {
            in_header = 0
        }
    }
    in_header == 1 && /^categories:/ {
        has_categories = 1
        print
        next
    }
    in_header == 1 && /^title:/ {
        print
        # 提取 title 中 [] 内的内容
        temp = $0
        sub(/.*\[/, "", temp)
        sub(/\].*/, "", temp)
        # 确保确实匹配到了方括号，才赋值给 category
        if (temp != $0) {
            category = temp
        }
        next
    }
    in_header == 1 && /^date:/ {
        print
        # 如果提取到了分类，且文件中原本没有 categories 字段，则插入
        if (category != "" && has_categories == 0) {
            print "categories: [" category "]"
        }
        next
    }
    { print }
    ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    
    echo "  -> 处理完成"
done

echo "--------------------------------------------------"
echo "所有文件处理完毕！"
