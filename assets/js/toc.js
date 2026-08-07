(function() {
    var toc = document.getElementById('toc');
    if (!toc) return;

    var content = document.querySelector('.post-content');
    if (!content) return;

    var headings = content.querySelectorAll('h1, h2, h3');
    if (!headings.length) {
        toc.innerHTML = '<p class="toc-empty">当前文章无目录</p>';
        return;
    }

    var root = document.createElement('ul');
    root.className = 'toc-list';
    var stack = [{ ul: root, level: 0 }];

    headings.forEach(function(h) {
        var level = parseInt(h.tagName.charAt(1));
        var text = h.textContent.trim();
        if (!text) return;

        var id = text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60);
        if (!id) id = 'section-' + Math.random().toString(36).substr(2, 8);
        h.id = id;

        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + id;
        a.textContent = text;
        a.addEventListener('click', function(e) {
            e.preventDefault();
            var target = document.getElementById(this.getAttribute('href').substring(1));
            if (target) {
                var offset = target.getBoundingClientRect().top + window.pageYOffset - 70;
                window.scrollTo({ top: offset, behavior: 'smooth' });
            }
            history.replaceState(null, null, '#' + id);
        });
        li.appendChild(a);

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        var parent = stack[stack.length - 1];
        parent.ul.appendChild(li);

        var sub = document.createElement('ul');
        li.appendChild(sub);
        stack.push({ ul: sub, level: level });
    });

    (function cleanEmpty(el) {
        var uls = el.querySelectorAll('ul');
        for (var i = uls.length - 1; i >= 0; i--) {
            if (uls[i].children.length === 0) {
                uls[i].parentNode.removeChild(uls[i]);
            }
        }
    })(root);

    toc.appendChild(root);

    var tocLinks = toc.querySelectorAll('a');
    var scrollTicking = false;

    function onScroll() {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(function() {
            var currentId = '';
            headings.forEach(function(h) {
                if (h.getBoundingClientRect().top <= 120) {
                    currentId = h.id;
                }
            });
            tocLinks.forEach(function(a) {
                var href = a.getAttribute('href');
                var isActive = href === '#' + currentId;
                if (isActive !== a.classList.contains('active')) {
                    a.classList.toggle('active', isActive);
                }
            });
            scrollTicking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
