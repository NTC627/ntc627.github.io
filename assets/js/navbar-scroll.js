document.addEventListener('DOMContentLoaded', function() {
    var navbar = document.querySelector('.navbar');
    if (!navbar) return;

    var lastScrollY = window.scrollY;
    var ticking = false;
    var threshold = 120;

    function update() {
        var currentScrollY = window.scrollY;

        if (currentScrollY <= 10) {
            navbar.classList.remove('hidden', 'translucent');
        } else if (currentScrollY > threshold && currentScrollY > lastScrollY) {
            navbar.classList.add('hidden');
            navbar.classList.remove('translucent');
        } else if (currentScrollY < lastScrollY) {
            navbar.classList.remove('hidden');
            if (currentScrollY > threshold) {
                navbar.classList.add('translucent');
            }
        }

        lastScrollY = currentScrollY;
        ticking = false;
    }

    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });
});
