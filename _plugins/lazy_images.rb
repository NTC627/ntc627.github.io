Jekyll::Hooks.register :site, :post_render do |site|
  site.pages.each do |page|
    next unless page.output && page.output.include?('<img')
    page.output = page.output.gsub(
      /<img(?!.*loading=)/,
      '<img loading="lazy"'
    )
  end

  site.documents.each do |doc|
    next unless doc.output && doc.output.include?('<img')
    doc.output = doc.output.gsub(
      /<img(?!.*loading=)/,
      '<img loading="lazy"'
    )
  end
end
