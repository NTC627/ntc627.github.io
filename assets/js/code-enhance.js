document.addEventListener('DOMContentLoaded', function () {
    var blocks = document.querySelectorAll('.post-content pre.highlight');
    if (!blocks.length) return;

    blocks.forEach(function (pre) {
        var code = pre.querySelector('code');
        if (!code) return;

        var text = code.textContent;
        if (text.endsWith('\n')) text = text.slice(0, -1);
        var lineCount = text.split('\n').length;
        if (!lineCount) return;

        var numbers = '';
        for (var i = 1; i <= lineCount; i++) {
            numbers += i + '\n';
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';

        var gutter = document.createElement('div');
        gutter.className = 'code-gutter';
        gutter.setAttribute('aria-hidden', 'true');
        gutter.innerHTML = '<pre><code>' + numbers + '</code></pre>';

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(gutter);
        wrapper.appendChild(pre);

        var container = wrapper.closest('.highlighter-rouge') || wrapper;
        container.style.position = 'relative';

        var btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.setAttribute('aria-label', 'Copy code');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

        btn.addEventListener('click', function () {
            var t = code.textContent;
            navigator.clipboard.writeText(t).then(function () {
                btn.classList.add('copied');
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                setTimeout(function () {
                    btn.classList.remove('copied');
                    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                }, 2000);
            }).catch(function () {
                btn.textContent = '!';
                setTimeout(function () {
                    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                }, 2000);
            });
        });

        container.appendChild(btn);
    });
});
