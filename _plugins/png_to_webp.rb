module PngToWebp
  def self.convert(site, output)
    output.gsub(/src="([^"]+\.png)"/) do
      src = $1
      png_path = File.join(site.source, src.delete_prefix('/'))
      next %(src="#{src}") unless File.exist?(png_path)

      webp_path = png_path.sub(/\.png$/, '.webp')

      system("magick", png_path, "-quality", "85", webp_path) unless File.exist?(webp_path)

      %(src="#{src.sub('.png', '.webp')}")
    end
  end
end

Jekyll::Hooks.register :pages, :post_render do |page, payload|
  page.output = PngToWebp.convert(page.site, page.output) if page.output.is_a?(String)
end

Jekyll::Hooks.register :documents, :post_render do |doc, payload|
  doc.output = PngToWebp.convert(doc.site, doc.output) if doc.output.is_a?(String)
end
