module Jekyll
  module SmartWordCount
    def smart_word_count(input)
      text = input.to_s

      # strip fenced code blocks (```lang ... ```)
      text = text.gsub(/```[\s\S]*?```/, '')

      # strip indented code blocks (lines starting with 4 spaces or tab)
      text = text.gsub(/^( {4,}|\t).*$/, '')

      # strip inline code (`...`)
      text = text.gsub(/`[^`]+`/, '')

      # strip HTML tags
      text = text.gsub(/<[^>]+>/, '')

      # count CJK characters (each = 1)
      cjk = text.scan(/\p{Han}/).size

      # count word-like sequences [a-zA-Z0-9_] (each = 1)
      words = text.scan(/[a-zA-Z0-9_]+/).size

      cjk + words
    end
  end
end

Liquid::Template.register_filter(Jekyll::SmartWordCount)
