(function () {

    /*=====================================
    Sticky
    ======================================= */
    window.onscroll = function () {
        var header_navbar = document.querySelector(".navbar-area");
        if (header_navbar) {
            var sticky = header_navbar.offsetTop;

            if (window.pageYOffset > sticky) {
                header_navbar.classList.add("sticky");
            } else {
                header_navbar.classList.remove("sticky");
            }
        }

        // Scroll-to-top button is handled by React component (ScrollToTop)
        // No need to manage it here
    };

    // section menu active
	function onScroll(event) {
		var sections = document.querySelectorAll('.page-scroll');
		var scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
		
		// Get navbar height dynamically
		var navbar = document.querySelector('.navbar-area');
		var headerOffset = navbar ? navbar.offsetHeight - 20 : 83; // navbar height + small padding

		for (var i = 0; i < sections.length; i++) {
			var currLink = sections[i];
			var val = currLink.getAttribute('href');
			if (!val || val === '#' || val === 'javascript:void(0)' || val.startsWith('http://') || val.startsWith('https://') || !val.startsWith('#')) {
				continue;
			}
			var refElement = document.querySelector(val);
			if (!refElement) {
				continue;
			}
			var scrollTopMinus = scrollPos + headerOffset;
			if (refElement.offsetTop <= scrollTopMinus && (refElement.offsetTop + refElement.offsetHeight > scrollTopMinus)) {
				var firstActive = document.querySelector('.page-scroll.active');
				if (firstActive) {
					firstActive.classList.remove('active');
				}
				currLink.classList.add('active');
			} else {
				currLink.classList.remove('active');
			}
		}
	};

    window.document.addEventListener('scroll', onScroll);
    
    // for menu scroll 
    var pageLink = document.querySelectorAll('.page-scroll');

    // Function to get navbar height dynamically
    function getNavbarHeight() {
        var navbar = document.querySelector('.navbar-area');
        if (navbar) {
            return navbar.offsetHeight;
        }
        return 73; // fallback
    }

    pageLink.forEach(elem => {
        elem.addEventListener('click', e => {
            var href = elem.getAttribute('href');
            if (!href || href === '#' || href === 'javascript:void(0)' || href.startsWith('http://') || href.startsWith('https://') || !href.startsWith('#')) {
                // Allow default behavior for external URLs and non-hash links
                return;
            }
            e.preventDefault();
            var targetElement = document.querySelector(href);
            if (targetElement) {
                // Get navbar height - always use current height
                var navbar = document.querySelector('.navbar-area');
                var navbarHeight = navbar ? navbar.offsetHeight : 73;
                
                // Get the element's position from top of document
                var rect = targetElement.getBoundingClientRect();
                var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                var elementTop = rect.top + scrollTop;
                
                // Calculate scroll position
                // We want the element to appear navbarHeight + spacing pixels from top
                // Adjust offset: subtract less to scroll higher (show content higher on screen)
                var spacing = 20; // Visual spacing below navbar
                var scrollPosition = elementTop - navbarHeight - spacing - 60; // Reduced from 100 to 60 for 20-40px higher
                
                console.log('Scrolling to:', href, 'Navbar height:', navbarHeight, 'Element top:', elementTop, 'Scroll to:', scrollPosition);

                // Use requestAnimationFrame for smoother scroll
                requestAnimationFrame(function() {
                    window.scrollTo({
                        top: Math.max(0, scrollPosition),
                        behavior: 'smooth'
                    });
                });
            }
        });
    });

    "use strict";

}) ();
